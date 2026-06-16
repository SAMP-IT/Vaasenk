// Vaasenk Mobile — Expo entry point.
//
// Expo SDK 52 supports either Expo Router (default) or a classic
// AppRegistry root. We're using React Navigation (per Playbook), so
// register App.tsx directly. `registerRootComponent` wraps App in
// the necessary providers Expo expects and calls AppRegistry under
// the hood — works for both managed and bare workflows.

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
