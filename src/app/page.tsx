'use client';

import { useState, DragEvent, useRef } from 'react';

interface ShazamTrack {
    index: string;
    tagTime: string;
    title: string;
    artist: string;
    url: string;
    trackKey: string;
}

interface SoundCloudTrack {
    title: string;
    artist: string;
    url: string;
    imageUrl?: string; // Optional: if we can get an image URL from the search results
}

interface SearchResult {
    shazamTrack: ShazamTrack;
    status: 'matched' | 'needs_review' | 'no_match';
    matchedTrack?: SoundCloudTrack; // Present if status is 'matched'
    soundCloudResults?: SoundCloudTrack[]; // Present if status is 'needs_review' or 'no_match'
}


// Function to generate a random code verifier (for PKCE)
function generateCodeVerifier(length: number = 128): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Function to generate the code challenge from the code verifier
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const buffer = new Uint8Array(digest);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return challenge;
}

async function sha256(plain: string) {
    // Transform text into ArrayBuffer
    const utf8 = new TextEncoder().encode(plain);

    // Hash the message
    const digest = await crypto.subtle.digest('SHA-256', utf8);

    return digest;
}

export default function Home() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [csvError, setCsvError] = useState<string | null>(null);
    const [parsedTracks, setParsedTracks] = useState<ShazamTrack[]>([]);
    const [isSearching, setIsSearching] = useState<boolean>(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
            setCsvError(null);
            setParsedTracks([]);
            setSearchResults([]);
        }
    };

    const parseCsv = (csvContent: string) => {
        const lines = csvContent.split('\n').filter(line => line.trim() !== '');

        if (lines.length < 2) {
            setCsvError('CSV file must contain at least a header and one data row.');
            return;
        }

        const expectedHeader = 'Index,TagTime,Title,Artist,URL,TrackKey';
        // Use the second line (index 1) for header validation as per requirement
        const actualHeader = lines[1].trim();

        if (actualHeader !== expectedHeader) {
            setCsvError(`Invalid CSV header. Expected: "${expectedHeader}", Got: "${actualHeader}"`);
            return;
        }

        // If header is valid, process the rest of the lines starting from index 2
        const tracks: ShazamTrack[] = [];
        // Process only the first 5 data rows for testing (lines from index 2 to 6)
        const linesToProcess = lines.slice(2, Math.min(lines.length, 2 + 5));

        for (let i = 0; i < linesToProcess.length; i++) {
            const values = linesToProcess[i].split(',');
            if (values.length === 6) {
                tracks.push({
                    index: values[0].trim(),
                    tagTime: values[1].trim(),
                    title: values[2].trim(),
                    artist: values[3].trim(),
                    url: values[4].trim(),
                    trackKey: values[5].trim(),
                });
            } else {
                console.warn(`Skipping malformed line ${i + 1}: ${linesToProcess[i]}`);
            }
        }

        setParsedTracks(tracks);
        console.log(`Successfully parsed ${tracks.length} tracks (first 5 data rows).`);

        if (tracks.length > 0) {
            performSearch(tracks);
        }
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);

        if (event.dataTransfer.files && event.dataTransfer.files[0]) {
            const droppedFile = event.dataTransfer.files[0];
            if (droppedFile.name.endsWith('.csv')) {
                setSelectedFile(droppedFile);
                setCsvError(null);
                setParsedTracks([]);
                setSearchResults([]);
            } else {
                setCsvError('Invalid file type. Please drop a CSV file.');
                setSelectedFile(null);
            }
        }
    };

    const handleParseCsv = () => {
        if (selectedFile) {
            setCsvError(null);
            setParsedTracks([]);
            setSearchResults([]);

            const reader = new FileReader();
            reader.onload = (e) => {
                const csvContent = e.target?.result as string;
                parseCsv(csvContent);
            };
            reader.readAsText(selectedFile);
        }
    };

    const initiateAuth = async () => {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        const clientId = process.env.NEXT_PUBLIC_SOUNDCLOUD_CLIENT_ID;
        const redirectUri = process.env.NEXT_PUBLIC_SOUNDCLOUD_REDIRECT_URI;
        const authorizationEndpoint = `https://api.soundcloud.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri ?? '')}&scope=non-expiring&code_challenge=${codeChallenge}&code_challenge_method=S256`;

        window.location.href = authorizationEndpoint;
    };

    // Placeholder function for SoundCloud search
    const searchSoundCloudForTrack = async (track: ShazamTrack): Promise<SoundCloudTrack[]> => {
        return [];
    };

    const performSearch = async (tracks: ShazamTrack[]) => {
        setIsSearching(true);
        const results: SearchResult[] = [];

        for (const track of tracks) {
            try {
                const soundCloudResults = await searchSoundCloudForTrack(track);
                let status: SearchResult['status'] = 'no_match';
                let matchedTrack: SoundCloudTrack | undefined = undefined;
                const tracksForReview: SoundCloudTrack[] = [];

                if (soundCloudResults.length > 0) {
                    // Check for exact match (case-insensitive and trim whitespace)
                    const exactMatch = soundCloudResults.find((scTrack) =>
                        scTrack.title.trim().toLowerCase() === `${track.artist.trim()} - ${track.title.trim()}`.toLowerCase() ||
                        (scTrack.title.trim().toLowerCase() === track.title.trim().toLowerCase() && scTrack.artist.trim().toLowerCase() === track.artist.trim().toLowerCase())
                    );

                    if (exactMatch) {
                        status = 'matched';
                        matchedTrack = exactMatch;
                    } else {
                        // If no exact match, but results exist, mark for review (show top 3)
                        status = 'needs_review';
                        tracksForReview.push(...soundCloudResults.slice(0, 3));
                    }
                }

                results.push({
                    shazamTrack: track,
                    status,
                    matchedTrack,
                    soundCloudResults: tracksForReview, // Store top 3 for review
                });
            } catch (error) {
                console.error(`Error processing search results for ${track.title} by ${track.artist}:`, error);
                results.push({ shazamTrack: track, status: 'no_match' });
            }
        }

        setSearchResults(results);
        setIsSearching(false);
        console.log('Search complete.');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'white', padding: '20px' }}>
            <div style={{
                background: 'linear-gradient(to right, #127cff 30%, #ff6f2a 70%)',
                borderRadius: '10px',
                padding: '10px 20px',
                marginBottom: '30px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: "20px",
                textAlign: 'center'
            }}>
                <h1>Shazam to SoundCloud App</h1>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    border: isDragging ? '2px dashed #127cff' : '2px dashed #ccc',
                    padding: '20px',
                    textAlign: 'center',
                    marginBottom: '20px',
                    width: '100%',
                    maxWidth: '400px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current?.click()}
            >
                {selectedFile ? (
                    <p>Selected file: {selectedFile.name}</p>
                ) : (
                    <p>Drag and drop a CSV file here or click to browse</p>
                )}
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    ref={fileInputRef}
                />
            </div>
            <button
                onClick={initiateAuth}
                style={{
                    background: 'linear-gradient(to top, #2054ff, #01a9ff)',
                    color: 'white',
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    marginBottom: '20px',
                    opacity: 1
                }}
            >
                Connect to SoundCloud
            </button>
            <button
                onClick={handleParseCsv}
                disabled={!selectedFile || isSearching}
                style={{
                    background: 'linear-gradient(to top, #2054ff, #01a9ff)',
                    color: 'white',
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    marginBottom: '20px',
                    opacity: (!selectedFile || isSearching) ? 0.6 : 1
                }}
            >
                {isSearching ? 'Searching...' : 'Parse CSV and Search SoundCloud'}
            </button>
            {csvError && <p style={{ color: 'red', marginBottom: '10px' }}>{csvError}</p>}

            {isSearching && <p style={{ color: 'red', marginBottom: '20px' }}>Searching for tracks on SoundCloud...</p>}

            {searchResults.length > 0 && (
                <div style={{ width: '100%', maxWidth: '600px' }}>
                    <h2>Search Results:</h2>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {searchResults.map((result, index) => (
                            <li key={index} style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#333' }}>
                                <h3 style={{ marginTop: 0, marginBottom: '10px' }}>Shazam Track: {result.shazamTrack.title} by {result.shazamTrack.artist}</h3>
                                {result.status === 'matched' && (
                                    <div>
                                        <p style={{ color: 'lightgreen', fontWeight: 'bold' }}>Match Found:</p>
                                        {result.matchedTrack && (
                                            <div style={{ marginLeft: '20px' }}>
                                                {result.matchedTrack.title} by {result.matchedTrack.artist} (<a href={result.matchedTrack.url} target="_blank" rel="noopener noreferrer" style={{ color: 'lightblue' }}>Link</a>)
                                            </div>
                                        )}
                                    </div>
                                )}
                                {result.status === 'needs_review' && (
                                    <div>
                                        <p style={{ color: 'gold', fontWeight: 'bold' }}>Needs Review (Top {result.soundCloudResults?.length} Results):</p>
                                        <ul style={{ listStyle: 'disc', paddingLeft: '40px' }}>
                                            {result.soundCloudResults?.map((scTrack, scIndex) => (
                                                <li key={scIndex} style={{ marginBottom: '5px' }}>
                                                    {scTrack.title} by {scTrack.artist} (<a href={scTrack.url} target="_blank" rel="noopener noreferrer" style={{ color: 'lightblue' }}>Link</a>)
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {result.status === 'no_match' && (
                                    <div>
                                        <p style={{ color: 'salmon', fontWeight: 'bold' }}>No direct match found.</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}