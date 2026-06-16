/**
 * Vaasenk Mobile — Auth navigator.
 *
 * Mounted when there is no active session. Welcome is the landing card
 * with the brand gradient hero; Login is the email/password form.
 *
 * No header for either screen — both render their own hero/back button so
 * the screens own their full vertical real estate.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { WelcomeScreen } from '@/screens/auth/WelcomeScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#FFF7EC' },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
