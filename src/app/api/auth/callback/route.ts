import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code');

  if (!code) {
    console.error('Missing authorization code.');
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  // State is not implemented (PKCE is enough for security)
  // const state = req.query.state;

  try {
    const tokenResponse = await fetch('https://api.soundcloud.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_SOUNDCLOUD_CLIENT_ID || '',
        client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.NEXT_PUBLIC_SOUNDCLOUD_REDIRECT_URI || '',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Failed to obtain access token:', tokenResponse.status, tokenResponse.statusText);
      return NextResponse.json({ error: 'Failed to obtain access token' }, { status: tokenResponse.status });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token } = tokenData;

    if (!access_token || !refresh_token) {
      console.error('Missing access token or refresh token.');
      return NextResponse.json({ error: 'Missing access token or refresh token' }, { status: 500 });
    }

    // TODO: Store the access_token and refresh_token securely (e.g., in a database or encrypted cookie)
    console.log('Access Token:', access_token);
    console.log('Refresh Token:', refresh_token);

    // Redirect the user to a success page or back to the main application
    return NextResponse.redirect(new URL('/success', request.url)); //Need a /success route

  } catch (error) {
    console.error('Error exchanging authorization code for access token:', error);
    return NextResponse.json({ error: 'Failed to exchange authorization code' }, { status: 500 });
  }
}
