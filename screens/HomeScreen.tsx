import React from 'react';
import {Button, Text, View} from 'react-native';

type Props = {navigation: any};

//this is the home screen with navigation buttons to other screens
//this function is exported into app.tsx
export default function HomeScreen({navigation}: Props) {
  return (
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text>Lets Get Started!</Text>
      <Button title="Live Data" onPress={() => navigation.navigate('LiveData')} />
    </View>
  );
}
