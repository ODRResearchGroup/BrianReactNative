import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationProp } from '@react-navigation/native';

interface DataDisplayProps {
  navigation: NavigationProp<any>;
}

export default function DataDisplay({ navigation }: DataDisplayProps) {
  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('LiveData')}>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Live Fingerprinting</Text>
          <Text style={styles.cardDescription}>
            Capture fingerprints{'\n'}and view the live data
          </Text>
        </View>
        <Image
          source={require('../../pics/fingerprint_single_frame.jpg')}
          style={styles.iconContainer}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('SmellWalk')}>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Smell Walk</Text>
          <Text style={styles.cardDescription}>
            Record sensor data{'\n'}and map your trail
          </Text>
        </View>
        <Image
          source={require('../../pics/map_frame.jpg')}
          style={styles.iconContainer}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('History')}>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Past fingerprints</Text>
          <Text style={styles.cardDescription}>
            Browse and analyse{'\n'}previous fingerprints
          </Text>
        </View>
        <Image
          source={require('../../pics/fingerprint_frame.jpg')}
          style={styles.iconContainer}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable style={styles.card} onPress={() => navigation.navigate('Map')}>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Mapped Fingerprints</Text>
          <Text style={styles.cardDescription}>
            Explore fingerprints{'\n'}on the map
          </Text>
        </View>
        <Image
          source={require('../../pics/map_frame.jpg')}
          style={styles.iconContainer}
          resizeMode="contain"
        />
      </Pressable>
    </SafeAreaView>
  );
}

const MARGIN = 20;
const GUTTER = 16;

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: MARGIN, paddingTop: 60 },
  header: {
    fontSize: 28,
    fontWeight: '600',
    color: '#000',
    marginBottom: 32,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: GUTTER,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#000',
  },
  cardContent: { flex: 1 },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  cardDescription: { fontSize: 14, color: '#666', lineHeight: 20 },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#6b4f3eff',
  },
  annotationIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f0ff',
  },
  annotationEmoji: { fontSize: 36 },
});
