/* The five tabs' icons, in one place: the tab bar draws them and the tour's
   last card shows the same five so a learner meets the bar before the bar
   (the owner, 2026-09-19). Two copies of a path drift; one list cannot. */

import React from "react";
import Svg, { Path } from "react-native-svg";

export const TABS = [
  { id: "Learn", d: "M4 19V6a2 2 0 0 1 2-2h5v15H6a2 2 0 0 0-2 2zM20 19V6a2 2 0 0 0-2-2h-5v15h5a2 2 0 0 1 2 2z" },
  { id: "Study", d: "M3 6h14v12H3zM7 3h14v13" },
  { id: "Practice", d: "M6 9v6M18 9v6M4 11v2M20 11v2M8 7v10M16 7v10M8 12h8" },
  { id: "Immerse", d: "M3 5h18v14H3zm8 4.5 4 2.5-4 2.5z" },
  { id: "Search", d: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5" },
];

export function TabGlyph({ d, color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}

/* What `tabBarIcon` wants: a component of ({ color, size }). */
export const tabIcon = (id) => {
  const tab = TABS.find((t) => t.id === id);
  return ({ color, size }) => <TabGlyph d={tab.d} color={color} size={size} />;
};
