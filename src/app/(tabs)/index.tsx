import { Text, View } from 'react-native';

import { colors, font } from '@/theme/tokens';

export default function LibraryScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 20 }}>Library</Text>
    </View>
  );
}
