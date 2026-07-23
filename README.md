# Analytify 🎵

Analytify is a modern, high-fidelity Angular web application that integrates with the Spotify Web API to provide detailed analytics, playlist management, and tracking of your personal listening trends. Styled with premium glassmorphism, harmoneous color palettes, and responsive layouts, it is designed to look sleek and feel dynamic.

## Features 🚀

### 1. Browse & Analyze Playlists
- **Current playlist access**: Browse playlists owned by the current user or shared through collaboration, matching Spotify's current playlist-item access rules.
- **Background Stats Loader**: A singleton background loader service (`PlaylistLoaderService`) fetches, parses, and caches playlist tracks and artist profiles concurrently. Going back or navigating away doesn't stop or delay loading.
- **Lazy Details Fetcher**: Fetches and aggregates track and artist profiles in background batches, ensuring metadata integrity and preventing concurrent request collisions.
- **Persistent data flow**: Uses local IndexedDB first, restores missing data from Supabase, and contacts Spotify only after the daily cutoff when neither persistent source has current data.
- **Album View**: Groups the real songs in any loaded playlist by album, including cover, artists, release year, song count, and combined duration.

### 2. Personal Listening Analytics
- **Top 100 Songs**: Displays your most listened to songs in customizable time periods (Last 4 Weeks, Last 6 Months, Last Year).
- **Top Artists**: Lists your top artists with profile cards and historical rank comparisons.
- **Top Genres**: Ranks the genres supplied with your Spotify top artists and preserves daily comparisons.

### 3. Historical Tracking & Trend Visualizations
- **Rank Snapshot Snapshots**: Save, browse, and compare historical rank snapshots. The app automatically computes rank indicators relative to the preceding snapshot.
- **Dynamic Chart Modal Popups**: Clicking any track or artist card displays a glassmorphic overlay chart plotting rank position changes over snapshot dates, with inverted Y-axis charts (making rank #1 sit at the top).
- **Badge Indicators**: Highlights new artists/songs in your snapshots with distinct rank badges.

### 4. Live Listening History
- **Recently Played**: Accessible directly from the header via the `Listening History` button, it showcases a real-time log of your last 50 listened to tracks, complete with relative time-elapsed markers (e.g. "Just now", "25m ago", "2h ago").

### 5. Seamless Security & Settings
- **Custom Confirmation Modals**: Features a custom middle-of-screen confirm modal before triggering "Clear Cache & Logout", ensuring you don't accidentally wipe accumulated stats history.
- **Responsive Dropdowns**: Custom-aligned Spotify capsule dropdowns handle options and sort directions smoothly.
- **Direct Redirection Links**: Click on track covers to directly open and listen to the song on Spotify.

---

## Tech Stack 🛠️

- **Core Framework**: Angular 16
- **Language**: TypeScript
- **Styling**: Vanilla CSS/SCSS with glassmorphic assets, Outfit / Google Fonts, and custom responsive layouts.
- **Third-Party Icons**: PrimeIcons
- **API Integration**: Spotify Web API (PKCE Authorization Flow)

---

## Getting Started ⚙️

### Prerequisites
- Node.js (v16+)
- npm

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
Start the development server:
```bash
npm start
```
The application will be available at `http://127.0.0.1:4200/`.
