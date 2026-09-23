import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { Screen } from '../../src/components/Screen';

import { Text } from '../../src/components/Text';
import { colors, role } from '../../src/theme/colors';
import { benchIcon, yellowFlowerIcon, treeIcon, leafBranchIcon, butterflyIcon, houseIcon } from "../../src/assets/embeddedAssets";
import {
  MIN_TOUCH_TARGET,
  fontSize,
  lineHeight,
  radius,
  spacing,
} from '../../src/theme/tokens';

type Phase = 'TELL' | 'ASK';

type StoryRecallData = {
  storyLines: string[];
  timeline: (string | ImageSourcePropType)[];
  question: string;
  choices: string[];
  correctIndex: number;
  storyVisuals?: ImageSourcePropType[][];
};

type StoryRecallProps = Partial<StoryRecallData> & {
  onSuccess?: () => void;
};


const SAMPLE_STORY: StoryRecallData = {
  storyLines: [
    'Anita went to the garden.',
    'She saw a butterfly.',
    'She sat on a bench.',
  ],
  storyVisuals: [
    [houseIcon, leafBranchIcon],
    [yellowFlowerIcon, butterflyIcon],
    [treeIcon, benchIcon]
  ],
  timeline: [houseIcon, butterflyIcon, '?'],
  question: 'What did she see in the garden?',
  choices: [
    'She picked a flower',
    'She saw a butterfly',
    'She drank water',
  ],
  correctIndex: 1,
};

const visualForLine = (line: string, index: number): ImageSourcePropType[] => {
  const normalizedLine = line.toLowerCase();
  if (normalizedLine.includes('butterfly')) return [yellowFlowerIcon, butterflyIcon];
  if (normalizedLine.includes('bench') || normalizedLine.includes('sat')) {
    return [treeIcon, benchIcon];
  }
  if (normalizedLine.includes('home') || normalizedLine.includes('house') || normalizedLine.includes('garden')) {
    return [houseIcon, leafBranchIcon];
  }
  return [leafBranchIcon];
};

const choiceMarker = (index: number) =>
  String.fromCharCode('A'.charCodeAt(0) + index);

const visualForChoice = (choice: string): ImageSourcePropType | null => {
  const normalizedChoice = choice.toLowerCase();
  if (normalizedChoice.includes('bench') || normalizedChoice.includes('sat')) return benchIcon;
  if (normalizedChoice.includes('flower')) return yellowFlowerIcon;
  if (normalizedChoice.includes('butterfly')) return butterflyIcon;
  if (normalizedChoice.includes('home')) return houseIcon;
  return leafBranchIcon;
};

export default function StoryRecallScreen({
  storyLines = SAMPLE_STORY.storyLines,
  storyVisuals,
  timeline = SAMPLE_STORY.timeline,
  question = SAMPLE_STORY.question,
  choices = SAMPLE_STORY.choices,
  correctIndex = SAMPLE_STORY.correctIndex,
  onSuccess,
}: StoryRecallProps) {
  const [phase, setPhase] = useState<Phase>('TELL');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // `colors` is intentionally imported with `role`: base colors remain available
  // to the theme module while this screen consumes semantic role colors only.
  void colors;

  const scenes = useMemo(
    () =>
      storyLines.map((line, index) => ({
        line,
        visual: storyVisuals?.[index] ?? visualForLine(line, index),
      })),
    [storyLines, storyVisuals],
  );

  const missingSceneIndex = timeline.findIndex(item => item === '?');
  const resolvedMissingSceneIndex =
    missingSceneIndex >= 0 ? missingSceneIndex : correctIndex;
  const successVisual =
    scenes[resolvedMissingSceneIndex]?.visual ??
    visualForChoice(choices[correctIndex] ?? '');

  const handleChoice = (index: number) => {
    setSelectedIndex(index);

    if (index === correctIndex) {
      setIsComplete(true);
      onSuccess?.();
    }
  };

  const restart = () => {
    setSelectedIndex(null);
    setIsComplete(false);
    setPhase('TELL');
  };

  return (
    <Screen 
      title="Story Recall" 
      showBack 
      showHome 
      scrollable
      onRepeat={() => {}}
      footer={
        phase === 'TELL' ? (
          <View style={styles.bottomBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="I am ready to find the missing part"
              onPress={() => setPhase('ASK')}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text
                variant="button"
                weight="bold"
                color="#FFFFFF"
              >
                I’m ready →
              </Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text variant="title" weight="bold" color="#0D2C1E" center>
            {phase === 'TELL' ? 'Anita’s Garden Story' : 'What comes next?'}
          </Text>

          <Text variant="bodyLarge" color="#0D2C1E" center>
            {phase === 'TELL'
              ? 'Look at each picture and follow Anita’s little journey.'
              : 'Use the picture path to remember the missing moment.'}
          </Text>
        </View>

        {phase === 'TELL' ? (
          <View style={styles.storyGrid}>
            {scenes.map((scene, index) => (
              <View
                key={`${scene.line}-${index}`}
                style={styles.sceneCard}
                accessible
                accessibilityLabel={`Story part ${index + 1}. ${scene.line}`}
              >
                <View style={styles.sceneIllustrationRow}>
                  {Array.isArray(scene.visual) ? (
                    scene.visual.map((img, i) => (
                      <Image key={i} source={img} style={styles.sceneImage} />
                    ))
                  ) : null}
                </View>

                <View style={styles.sceneCaption}>
                  <Text variant="bodyLarge" weight="bold" color="#0D2C1E" center>
                    {scene.line}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.askSection}>
            <View
              style={styles.timelineCard}
              accessible
              accessibilityLabel={`Story picture path: ${timeline.join(', ')}`}
            >
              <Text variant="body" weight="bold" color={role.bodyText}>
                THE STORY PATH
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timelineContent}
              >
                {timeline.map((item, index) => (
                  <React.Fragment key={`${item}-${index}`}>
                    <View
                      style={[
                        styles.timelineStep,
                        item === '?' && styles.missingTimelineStep,
                      ]}
                    >
                      {typeof item === 'string' ? (
                        <Text
                          variant="display"
                          weight="bold"
                          color={
                            item === '?' ? role.screenBackground : role.bodyText
                          }
                        >
                          {item}
                        </Text>
                      ) : (
                        <Image source={item} style={styles.timelineImage} />
                      )}
                    </View>

                    {index < timeline.length - 1 && (
                      <Text
                        variant="display"
                        weight="bold"
                        color="#0D2C1E"
                        accessibilityElementsHidden
                      >
                        →
                      </Text>
                    )}
                  </React.Fragment>
                ))}
              </ScrollView>
            </View>

            {isComplete ? (
              <View
                style={styles.successCard}
                accessible
                accessibilityRole="alert"
                accessibilityLabel="Wonderful. You found the missing part."
              >
                {successVisual && !Array.isArray(successVisual) && typeof successVisual !== 'string' ? (
                  <Image source={successVisual} style={styles.successImage} />
                ) : null}
                <Text variant="heading" weight="bold" color={role.bodyText}>
                  Wonderful!
                </Text>
                <Text variant="body" color={role.bodyText}>
                  You remembered: {choices[correctIndex]}.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Play this story again"
                  onPress={restart}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    variant="button"
                    weight="bold"
                    color="#FFFFFF"
                  >
                    Play again
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.questionArea}>
                <View style={styles.questionCard}>
                  <Text variant="display" accessibilityElementsHidden>
                    🤔
                  </Text>
                  <Text variant="heading" weight="bold" color={role.bodyText}>
                    {question}
                  </Text>
                </View>

                <View
                  style={styles.choices}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Choose the missing part"
                >
                  {choices.map((choice, index) => {
                    const isSelected = selectedIndex === index;
                    const showTryAgain = isSelected && index !== correctIndex;

                    return (
                      <Pressable
                        key={choice}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${choiceMarker(index)}. ${choice}`}
                        onPress={() => handleChoice(index)}
                        style={({ pressed }) => [
                          styles.choiceButton,
                          isSelected && styles.selectedChoice,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.choiceMarker}>
                          <Text
                            variant="button"
                            weight="bold"
                            color="#FFFFFF"
                          >
                            {choiceMarker(index)}
                          </Text>
                        </View>
                        {visualForChoice(choice) ? (
                          <Image source={visualForChoice(choice)!} style={styles.choiceImage} />
                        ) : null}
                        <Text
                          variant="button"
                          weight="bold"
                          color="#0D2C1E"
                          style={styles.choiceLabel}
                        >
                          {choice}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedIndex !== null && selectedIndex !== correctIndex && (
                  <View style={styles.encouragement} accessibilityRole="alert">
                    <Text variant="body" weight="bold" color="#0D2C1E">
                      Good try. Look at the picture path and choose once more.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: 40,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  storyGrid: {
    gap: spacing.lg,
  },
  sceneCard: {
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: "#E3DAC0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sceneIllustrationRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    minHeight: 120,
  },
  sceneImage: {
    width: 80,
    height: 80,
    resizeMode: "contain",
  },
  sceneCaption: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  askSection: {
    gap: spacing.xl,
  },
  timelineCard: {
    backgroundColor: role.surfaceCardBackground,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  timelineContent: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  timelineStep: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    backgroundColor: role.screenBackground,
    padding: spacing.lg,
  },
  timelineImage: {
    width: 48,
    height: 48,
    resizeMode: "contain",
  },
  missingTimelineStep: {
    backgroundColor: "#0D2C1E",
  },
  questionArea: {
    gap: spacing.xl,
  },
  questionCard: {
    alignItems: 'center',
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  choices: {
    gap: spacing.lg,
  },
  choiceButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: "#E3DAC0",
  },
  selectedChoice: {
    backgroundColor: "#E2F2E4",
  },
  choiceMarker: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: "#0D2C1E",
  },
  choiceImage: {
    width: 32,
    height: 32,
    resizeMode: "contain",
  },
  choiceLabel: {
    flex: 1,
  },
  encouragement: {
    backgroundColor: "#F9F8F1",
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  successImage: {
    width: 80,
    height: 80,
    resizeMode: "contain",
  },
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "#0D2C1E",
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  pressed: {
    opacity: 0.82,
  },
});

// Keep token imports explicit: the custom Text component consumes the theme's
// typography scale, while these references document the required screen scale.
void fontSize;
void lineHeight;
