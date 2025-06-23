'use client';

import { useState, DragEvent, useRef, useEffect } from 'react';

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
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [codeVerifier, setCodeVerifier] = useState<string | null>(null);
    const [matchedTracks, setMatchedTracks] = useState<SearchResult[]>([]);
    const [unmatchedTracks, setUnmatchedTracks] = useState<SearchResult[]>([]);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const tracksPerPage = 20; // Constant for the number of tracks per search page

    useEffect(() => {
        // Extract access_token, refresh_token and code_verifier from URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const accessTokenFromURL = urlParams.get('access_token');
        const refreshTokenFromURL = urlParams.get('refresh_token');

        if (accessTokenFromURL && refreshTokenFromURL) {
            setAccessToken(accessTokenFromURL);
            setRefreshToken(refreshTokenFromURL);
            setIsAuthenticated(true);

            // Clear the query parameters from the URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
            setCsvError(null);
            setParsedTracks([]);
            setMatchedTracks([]); // Clear previous results
            setUnmatchedTracks([]); // Clear previous results
            setCurrentPage(1); // Reset pagination
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
        // Process ALL data rows starting from index 2
        const linesToProcess = lines.slice(2);

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
        console.log(`Successfully parsed ${tracks.length} tracks.`);

        if (tracks.length > 0) {
            performSearch(tracks, 1);
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
                setMatchedTracks([]); // Clear previous results
                setUnmatchedTracks([]); // Clear previous results
                setCurrentPage(1); // Reset pagination
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
            setMatchedTracks([]); // Clear previous results
            setUnmatchedTracks([]); // Clear previous results
            setCurrentPage(1); // Reset pagination

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
        const state = generateCodeVerifier(32); // Generate a random state value

        const authorizationEndpoint = `https://secure.soundcloud.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri ?? '')}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;

        document.cookie = `code_verifier=${codeVerifier}; path=/; max-age=3600`; // Store in cookie
        window.location.href = authorizationEndpoint;
    };

   const searchSoundCloudForTrack = async (track: ShazamTrack): Promise<SoundCloudTrack[]> => {
        if (!accessToken) {
            console.warn('Access token not available. Please authenticate with SoundCloud.');
            return [];
        }

        const query = `${track.artist} ${track.title}`;
        const apiUrl = `https://api.soundcloud.com/tracks?q=${encodeURIComponent(query.replace(/"+/g,''))}`;

        try {
            const response = await fetch(apiUrl, {
                headers: {
                    accept: `application/json; charset=utf-8`,
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                console.error('SoundCloud API request failed:', response.status, response.statusText);
                return [];
            }

            const data = await response.json();

            // Map the API response to the SoundCloudTrack interface
            const soundCloudResults: SoundCloudTrack[] = data.map((item: any) => ({
                title: item.title,
                artist: item.user.username,
                url: item.permalink_url,
                imageUrl: item.artwork_url || undefined,
            }));

            return soundCloudResults;
        } catch (error) {
            console.error('Error searching SoundCloud:', error);
            return [];
        }
    };

    const performSearch = async (tracks: ShazamTrack[], page: number) => {
        setIsSearching(true);
        const startIndex = (page - 1) * tracksPerPage;
        const endIndex = startIndex + tracksPerPage;
        const tracksToProcess = tracks.slice(startIndex, endIndex);

        const currentBatchMatched: SearchResult[] = [];
        const currentBatchUnmatched: SearchResult[] = [];

        for (const track of tracksToProcess) {
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
                        currentBatchMatched.push({
                            shazamTrack: track,
                            status,
                            matchedTrack,
                            soundCloudResults: [], // No review needed for matched
                        });
                    } else {
                        // If no exact match, but results exist, mark for review (show top 3)
                        status = 'needs_review';
                        tracksForReview.push(...soundCloudResults.slice(0, 3));
                         currentBatchUnmatched.push({
                            shazamTrack: track,
                            status,
                            matchedTrack: undefined,
                            soundCloudResults: tracksForReview, // Store top 3 for review
                        });
                    }
                } else {
                     currentBatchUnmatched.push({
                            shazamTrack: track,
                            status: 'no_match',
                            matchedTrack: undefined,
                            soundCloudResults: [],
                        });
                }

            } catch (error) {
                console.error(`Error processing search results for ${track.title} by ${track.artist}:`, error);
                 currentBatchUnmatched.push({ shazamTrack: track, status: 'no_match' });
            }
        }

        setMatchedTracks(prev => [...prev, ...currentBatchMatched]);
        setUnmatchedTracks(prev => [...prev, ...currentBatchUnmatched]);
        setIsSearching(false);
        console.log(`Search complete for page ${page}. Processed ${tracksToProcess.length} tracks.`);
    };

    const loadNextPage = () => {
        if ((currentPage * tracksPerPage) < parsedTracks.length && !isSearching) {
            setCurrentPage(prevPage => prevPage + 1);
            performSearch(parsedTracks, currentPage + 1);
        }
    };

    // Functions for moving tracks between lists
    const moveToUnmatched = (trackToMove: SearchResult) => {
        setMatchedTracks(prev => prev.filter(track => track.shazamTrack.trackKey !== trackToMove.shazamTrack.trackKey));
        // When moving to unmatched, keep the soundCloudResults if they existed, and set status to 'needs_review'
        setUnmatchedTracks(prev => [...prev, { ...trackToMove, status: 'needs_review', matchedTrack: undefined }]);
        console.log('Moved track to needs review:', trackToMove.shazamTrack.title);
    };

    const moveToMatched = (trackToMove: SearchResult) => {
        setUnmatchedTracks(prev => prev.filter(track => track.shazamTrack.trackKey !== trackToMove.shazamTrack.trackKey));
        // When moving to matched, if there were soundCloudResults, use the first one as matchedTrack.
        // If not, or if status was 'no_match', set matchedTrack to undefined.
        const matchedSoundCloudTrack = (trackToMove.soundCloudResults && trackToMove.soundCloudResults.length > 0)
            ? trackToMove.soundCloudResults[0]
            : undefined;
        setMatchedTracks(prev => [...prev, { ...trackToMove, status: 'matched', matchedTrack: matchedSoundCloudTrack, soundCloudResults: [] }]);
        console.log('Moved track to matched:', trackToMove.shazamTrack.title);
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
            {isAuthenticated ? (
                <img
                    src="https://connect.soundcloud.com/2/btn-disconnect-l.png"
                    // TODO : onClick={terminateAuth} to disconnect from SoundCloud
                    style={{
                        marginBottom: '20px',
                        cursor: 'not-allowed'
                    }}
                    alt="Disconnect from SoundCloud"
                ></img>
            ) : (
                <img
                    src="https://connect.soundcloud.com/2/btn-connect-sc-l.png"
                    onClick={initiateAuth}
                    style={{
                        marginBottom: '20px',
                        cursor: 'pointer'
                    }}
                    alt="Connect to SoundCloud"
                ></img>
            )}
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
                onClick={handleParseCsv}
                disabled={!selectedFile || isSearching}
                style={{
                    background: 'linear-gradient(to top, #2054ff, #01a9ff)',
                    color: 'white',
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: (!selectedFile || isSearching) ? 'default' :'pointer',
                    fontSize: '16px',
                    marginBottom: '20px',
                    opacity: !selectedFile ? 0 : isSearching ? 0.6 : 1 // Adjusted opacity for disabled state
                }}
            >
                {isSearching ? 'Searching...' : 'Parse CSV and Search SoundCloud'}
            </button>
            {csvError && <p style={{ color: 'red', marginBottom: '10px' }}>{csvError}</p>}

            {isSearching && <p style={{ color: 'red', marginBottom: '20px' }}>Searching for tracks on SoundCloud...</p>}

            {/* Display Matched Tracks */}
            {matchedTracks.length > 0 && (
                <div style={{ width: '100%', maxWidth: '600px', marginTop: '20px' }}>
                    <h2>Matched Tracks:</h2>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {matchedTracks.map((result, index) => (
                            <li key={index} style={{ marginBottom: '10px', border: '1px solid #ccc', padding: '10px', borderRadius: '8px', background: '#333' }}>
                                <h3 style={{ marginTop: 0, marginBottom: '5px' }}>{result.shazamTrack.title} by {result.shazamTrack.artist}</h3>
                                <p style={{ color: 'lightgreen' }}>Match Found:</p>
                                {result.matchedTrack && (
                                    <div style={{ marginLeft: '20px' }}>
                                        {result.matchedTrack.title} by {result.matchedTrack.artist} (<a href={result.matchedTrack.url} target="_blank" rel="noopener noreferrer" style={{ color: 'lightblue' }}>Link</a>)
                                    </div>
                                )}
                                {/* Add button to move to unmatched */}
                                <button onClick={() => moveToUnmatched(result)} style={{ marginTop: '10px', background: '#ff6f2a', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer' }}>Move to Needs Review</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Display Unmatched/Needs Review Tracks */}
            {unmatchedTracks.length > 0 && (
                <div style={{ width: '100%', maxWidth: '600px', marginTop: '20px' }}>
                    <h2>Tracks Needing Review:</h2>
                     <ul style={{ listStyle: 'none', padding: 0 }}>
                        {unmatchedTracks.map((result, index) => (
                            <li key={index} style={{ marginBottom: '10px', border: '1px solid #ccc', padding: '10px', borderRadius: '8px', background: '#333' }}>
                                 <h3 style={{ marginTop: 0, marginBottom: '5px' }}>{result.shazamTrack.title} by {result.shazamTrack.artist}</h3>
                                {result.status === 'needs_review' && (
                                    <div>
                                        <p style={{ color: 'gold' }}>Needs Review (Top {result.soundCloudResults?.length} Results):</p>
                                        <ul style={{ listStyle: 'disc', paddingLeft: '20px' }}>
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
                                        <p style={{ color: 'salmon' }}>No direct match found.</p>
                                    </div>
                                )}
                                {/* Add button to move to matched */}
                                <button onClick={() => moveToMatched(result)} style={{ marginTop: '10px', background: '#127cff', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer' }}>Move to Matched</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Load More Button */}
            {(matchedTracks.length + unmatchedTracks.length < parsedTracks.length) && !isSearching && (
                 <button
                    onClick={loadNextPage}
                    style={{
                        background: '#555',
                        color: 'white',
                        padding: '10px 20px',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        marginTop: '20px',
                    }}
                >
                    Load More Tracks
                </button>
            )}

        </div>
    );
}
