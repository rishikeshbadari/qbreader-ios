# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Dev Tools section in Settings

The Settings tab has a "Dev Tools" section (Reset state, Start/Stop playtest peer) that is **only rendered when Metro is started with `EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1`** — i.e. during an autonomous `/playtest` run. In a normal `npx expo start` session (including Expo Go on your phone), the section is hidden so it can't be confused with production state. The gate lives in [app/(tabs)/settings.tsx](app/(tabs)/settings.tsx) — search for `EXPO_PUBLIC_USE_PAIRED_LOOPBACK`.

If you want the Dev Tools buttons during a manual session, restart Metro with:

```bash
EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1 EXPO_PUBLIC_QBREADER_MOCK=1 npx expo start --ios
```

Note that this also switches multiplayer to the in-process `PairedLoopbackTransport`, so cross-device (phone + sim) multiplayer will not work in that mode — use the default start command for real Supabase multiplayer.

## Architecture overview

- **Routing & layout**: File-based routes under `app/` with a root stack (`app/_layout.tsx`) and tab navigator in `app/(tabs)/`. Multiplayer has its own stack under `app/multiplayer/`.
- **State providers**: `context/SettingsContext.tsx` stores filters and reveal speed with AsyncStorage; `context/QuizSessionContext.tsx` manages single-player questions/history; `context/MultiplayerContext.tsx` coordinates session state, transport, and summaries.
- **Services**: `services/qbreader.ts` wraps QBReader API calls and normalization; `services/multiplayer/transport.ts` provides platform transports; `services/voice.ts` handles TTS.
- **UI components**: Themed primitives in `components/Themed*`, quiz-specific UI in `components/quiz/`, and shared UI utilities in `components/ui/`.
- **Utilities & types**: `utils/` for text and directive helpers, `types/` for API/transport shapes, and `hooks/` for context accessors and derived session stats.
- **Responsive system**: `utils/responsive.ts` supplies scale/verticalScale/moderateScale, spacing tokens, typography helpers, and breakpoints; UI components use these helpers instead of fixed pixel values.
