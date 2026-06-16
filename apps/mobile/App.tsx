/**
 * Vaasenk Mobile — App entry point.
 *
 * Stays small on purpose. Three responsibilities:
 *   1. Load Inter fonts via @expo-google-fonts/inter; hold the native
 *      splash screen until they're ready so users never see a font swap.
 *   2. Mount the canonical provider stack:
 *        GestureHandlerRootView   (gesture handler must be the outermost)
 *        SafeAreaProvider         (insets for every screen)
 *        AuthProvider             (our role-aware auth context)
 *        NavigationContainer      (React Navigation root)
 *   3. Hand control to RootNavigator which dispatches to the right
 *      stack based on auth state and role.
 *
 * The global.css import is what lets NativeWind's Metro plugin pick up the
 * Tailwind class scanning. Without it, classNames silently no-op.
 */

import './global.css';

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { AuthProvider } from '@/services/auth-context';
import { RootNavigator } from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/navigation-ref';
import { vaasenkNative } from '@/theme/tokens';

// Keep the native splash visible until fonts (and the auth boot probe)
// have run. The JS-side SplashScreen component takes over from there for
// the auth check, then RootNavigator swaps to AuthStack/StudentTabs/etc.
SplashScreen.preventAutoHideAsync().catch(() => {
  // The promise rejects if it's already been called — not fatal.
});

// React Navigation theme tweaked so the background matches Vaasenk's
// Warm Canvas instead of stock white. Prevents the brief flash that
// happens between screen transitions on Android.
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: vaasenkNative.colors.surface.warmCanvas,
    card: vaasenkNative.colors.surface.creamCard,
    text: vaasenkNative.colors.text.ink,
    primary: vaasenkNative.colors.brand.red,
    border: 'rgba(160,0,0,0.08)',
  },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide the native splash; from here the JS Splash component owns
      // the visual transition until the auth context resolves.
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  // While fonts are loading we deliberately render nothing — the native
  // splash is still up. If the font request fails we still mount the app
  // (system font fallback). Don't block the user on a font CDN error.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <RootNavigator />
            <StatusBar style="dark" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
