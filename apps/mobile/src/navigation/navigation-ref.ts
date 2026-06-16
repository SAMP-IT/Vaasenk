/**
 * Vaasenk Mobile — App-level navigation ref (Sprint 7.4).
 *
 * Lives in its own module so background services (push tap handlers,
 * notification deep-links) can dispatch navigation without dragging a
 * navigation prop through React trees they don't belong to — AND without
 * creating a circular import between App.tsx and RootNavigator.
 *
 * Bound to the root NavigationContainer in App.tsx via `ref={navigationRef}`.
 * Callers MUST guard with `navigationRef.isReady()` before invoking
 * `.navigate(...)`; the ref is null during the initial paint and remains
 * non-ready while the container is unmounted (e.g. on logout).
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();
