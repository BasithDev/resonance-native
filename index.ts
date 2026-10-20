// App entry: expo-router plus the home-screen widget's headless task handler.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widget/taskHandler';

registerWidgetTaskHandler(widgetTaskHandler);
