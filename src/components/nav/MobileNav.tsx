import React, { useState } from "react";

import { BottomTabBar } from "./BottomTabBar";
import { MoreDrawer } from "./MoreDrawer";

type Props = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export function MobileNav({ activeTab, onTabChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <BottomTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onMoreOpen={() => setMoreOpen(true)}
      />
      <MoreDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onTabChange={(tab) => {
          onTabChange(tab);
          setMoreOpen(false);
        }}
      />
    </>
  );
}
