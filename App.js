import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GROQ_API_KEY } from './apiKey';

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SYSTEM_PROMPT =
  "You are an ADHD task breakdown assistant. Your job is to turn a user's task into a list of extremely tiny, doable steps. Rules:\n" +
  "- Output exactly 3 to 6 steps.\n" +
  "- Each step must take less than 2 minutes to complete.\n" +
  "- Each step must start with an action verb (e.g., 'Pick up', 'Open', 'Write', 'Touch', 'Stand up').\n" +
  '- No step may involve a decision (e.g., "choose which sock" is bad; "pick up the blue sock from the floor" is good).\n' +
  '- Be absurdly concrete. Include objects, locations, and quantities (e.g., "Put the red coffee mug into the sink" not "clean the mug").\n' +
  "- Use the user's description (if provided) to identify their specific struggles (e.g., distractions, indecision, overwhelm) and pre-solve those in the steps.\n" +
  "- Return only a JSON array of strings, no extra text. Example: ['Stand up from your chair.', 'Walk to the desk.', 'Pick up the three pens and put them in the drawer.']";

export default function App() {
  const [screen, setScreen] = useState('input'); // 'input' | 'loading' | 'steps' | 'completed' | 'error'
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [cachedPlan, setCachedPlan] = useState(null);

  // Load cached breakdown on mount
  useEffect(() => {
    (async () => {
      try {
        const json = await AsyncStorage.getItem('@cached_breakdown');
        if (json) setCachedPlan(JSON.parse(json));
      } catch (_) {}
    })();
  }, []);

  const saveToCache = async (stepsArray) => {
    try {
      await AsyncStorage.setItem('@cached_breakdown', JSON.stringify(stepsArray));
      setCachedPlan(stepsArray);
    } catch (_) {}
  };

  const handleBreakDown = async () => {
    if (!taskTitle.trim()) {
      Alert.alert('Missing title', 'Please enter a task title.');
      return;
    }
    setScreen('loading');
    setError('');

    const userMessage = `Task: ${taskTitle}.${
      taskDescription ? ' Description: ' + taskDescription : ''
    }`;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API error');

      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from API');

      // The model should return a JSON array – parse it safely
      let parsedSteps;
      try {
        parsedSteps = JSON.parse(content);
      } catch {
        const match = content.match(/\[.*\]/s);
        if (match) parsedSteps = JSON.parse(match[0]);
        else throw new Error('Response was not a valid JSON array');
      }

      if (!Array.isArray(parsedSteps) || parsedSteps.length === 0) {
        throw new Error('No steps returned');
      }

      setSteps(parsedSteps);
      setCurrentStepIndex(0);
      await saveToCache(parsedSteps);
      setScreen('steps');
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setScreen('error');
    }
  };

  const handleDone = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      setScreen('completed');
    }
  };

  const handleNewTask = () => {
    setTaskTitle('');
    setTaskDescription('');
    setSteps([]);
    setCurrentStepIndex(0);
    setError('');
    setScreen('input');
  };

  const handleUseCached = () => {
    if (cachedPlan) {
      setSteps(cachedPlan);
      setCurrentStepIndex(0);
      setError('');
      setScreen('steps');
    }
  };

  // ---------- SCREENS ----------
  if (screen === 'input') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>ADHD Task Breaker</Text>
        <TextInput
          style={styles.input}
          placeholder="Task title (e.g., clean my room)"
          placeholderTextColor="#888"
          value={taskTitle}
          onChangeText={setTaskTitle}
          autoFocus
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Description (optional) – e.g., I get overwhelmed where to start"
          placeholderTextColor="#888"
          value={taskDescription}
          onChangeText={setTaskDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.button} onPress={handleBreakDown} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Break it down</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Breaking down task...</Text>
      </View>
    );
  }

  if (screen === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
        {cachedPlan ? (
          <>
            <TouchableOpacity style={styles.button} onPress={handleUseCached}>
              <Text style={styles.buttonText}>Use last cached plan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleNewTask}
            >
              <Text style={styles.buttonText}>New task</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.infoText}>Please check internet and try again.</Text>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleNewTask}
            >
              <Text style={styles.buttonText}>New task</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  if (screen === 'steps') {
    const step = steps[currentStepIndex];
    return (
      <View style={styles.container}>
        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>
            Step {currentStepIndex + 1} of {steps.length}
          </Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
        <View style={styles.stepButtons}>
          <TouchableOpacity style={styles.button} onPress={handleDone} activeOpacity={0.7}>
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => {}} // repeat – stays on same step
          >
            <Text style={styles.buttonText}>Repeat step</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'completed') {
    return (
      <View style={styles.container}>
        <Text style={styles.celebration}>🎉 All done!</Text>
        <TouchableOpacity style={styles.button} onPress={handleNewTask}>
          <Text style={styles.buttonText}>New task</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    fontSize: 20,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    color: '#000',
    backgroundColor: '#F5F5F5',
  },
  multiline: {
    minHeight: 100,
  },
  button: {
    backgroundColor: '#000',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    marginVertical: 10,
  },
  secondaryButton: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 20,
    color: '#000',
  },
  stepCard: {
    width: '100%',
    backgroundColor: '#FFFFCC',
    borderRadius: 16,
    padding: 30,
    marginBottom: 40,
    borderWidth: 2,
    borderColor: '#000',
  },
  stepNumber: {
    fontSize: 18,
    color: '#000',
    marginBottom: 10,
  },
  stepText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
  },
  stepButtons: {
    width: '100%',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 20,
    color: 'red',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 20,
    color: '#000',
    marginBottom: 20,
    textAlign: 'center',
  },
  celebration: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
});
