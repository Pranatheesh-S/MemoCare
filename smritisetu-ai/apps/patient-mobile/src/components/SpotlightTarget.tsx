import React, { useEffect, useRef } from "react";
import { View, ViewProps } from "react-native";
import { useSpotlightStore } from "../store/spotlightStore";

interface SpotlightTargetProps extends ViewProps {
  id: string;
  children: React.ReactNode;
}

export function useSpotlightTarget(id: string) {
  const viewRef = useRef<View>(null);
  const activeTargetId = useSpotlightStore((state) => state.activeTargetId);
  const registerLayout = useSpotlightStore((state) => state.registerLayout);

  useEffect(() => {
    if (activeTargetId === id && viewRef.current) {
      setTimeout(() => {
        viewRef.current?.measure((x, y, width, height, pageX, pageY) => {
          registerLayout(id, { x: pageX, y: pageY, width, height });
        });
      }, 50);
    }
  }, [activeTargetId, id, registerLayout]);

  return viewRef;
}

export function SpotlightTarget({ id, children, style, ...rest }: SpotlightTargetProps) {
  const ref = useSpotlightTarget(id);

  return (
    <View ref={ref} style={style} collapsable={false} {...rest}>
      {children}
    </View>
  );
}
