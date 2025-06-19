# Shazam to SoundCloud App

This app allows you to upload a CSV file containing Shazam track data and search for corresponding tracks on SoundCloud.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## CSV File Format

The app expects a CSV file with the following header row:

```plaintext
Index,TagTime,Title,Artist,URL,TrackKey
