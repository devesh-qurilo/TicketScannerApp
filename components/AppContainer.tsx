import { PropsWithChildren, useEffect } from "react";
import { View } from "react-native";

import { useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

export default function AppContainer({ children }: PropsWithChildren) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const hydrateResolvedTheme = useAppStore((state) => state.hydrateResolvedTheme);

  useEffect(() => {
    hydrateResolvedTheme();
  }, [hydrateResolvedTheme]);

  const theme = getTheme(resolvedTheme);

  return <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>{children}</View>;
}
