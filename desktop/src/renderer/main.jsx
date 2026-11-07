/* The app, mounted once the payload is in (index.jsx). */

import React from "react";
import { createRoot } from "react-dom/client";
import { setDayStart } from "@core/util";
import { SessionProvider } from "./session.jsx";
import { SettingsProvider } from "./settings.js";
import { InspectorProvider } from "./words.jsx";
import { App } from "./App.jsx";

/* Where the day starts, from this computer's clock (§30ad: 4 am local). */
setDayStart({ offsetMinutes: new Date().getTimezoneOffset() });

createRoot(document.getElementById("root")).render(
  <SettingsProvider>
    <SessionProvider>
      <InspectorProvider>
        <App />
      </InspectorProvider>
    </SessionProvider>
  </SettingsProvider>,
);
