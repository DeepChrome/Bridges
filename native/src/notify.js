/* The daily reminder — the only notification Bridges ever sends.
 *
 * One file, for the reason `haptics.js` and `motion.js` are one file: the
 * moment a second place can schedule something, the app acquires a second
 * voice and nobody can say what it will send. Everything here is swallowed,
 * because a reminder that fails is a reminder that did not arrive, never a
 * session that broke.
 *
 * **It is off until asked for, and permission is requested at the switch, not
 * at launch** — the rule the microphone already follows (§30c). An app that
 * asks for notifications on its first screen is an app whose notifications get
 * refused before it has earned anything.
 *
 * **A day already worked is skipped.** This is the whole design. Research in
 * §30t says people leave a language app by bingeing rather than by boredom, so
 * the reminder exists to protect the habit — and the fastest way to lose a
 * reminder's credibility is to nag somebody who has already done the thing.
 * That is why these are rolling one-off notifications rather than one repeating
 * daily trigger: a repeating trigger fires every day whatever happened, and
 * there is no way to drop a single instance of it.
 *
 * The cost of the rolling window is that it has to be re-armed while the app is
 * open, so a learner who never opens Bridges stops being reminded after
 * `HORIZON` days. That is deliberate rather than a limitation to fix: two weeks
 * of unanswered reminders is the app being asked to stop.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { workedOn } from "@core/scheduler";
import { dayOf } from "@core/util";

export const HORIZON = 14;
const CHANNEL = "daily";
/* Rule 20.7: a label, not a sentence. A notification is the one place copy is
   read with no screen around it to explain it, so it says the thing and stops. */
const TITLE = "Bridges";
const BODY = "Time for Russian";

/* Which instants a reminder should land on, given the learner's state and the
   minute of the day they chose. Pure, and exported so the suite can drive it
   without the native module — the scheduling below is a loop over this.

   A candidate is dropped when it has already passed, or when its **study day**
   has been worked. Reading the study day off `dayOf` rather than testing "is
   this the first iteration" is what makes it right around the 4 am rollover
   (§30ad): at 01:00 the clock's today and the scheduler's today are different
   days, and a reminder set for the evening belongs to the later one. */
export function nextTimes(st, minutes, now = new Date(), horizon = HORIZON) {
  const out = [];
  if (!Number.isFinite(minutes)) return out;
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() + i);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (workedOn(st, dayOf(d.getTime()))) continue;
    out.push(d);
    if (out.length >= horizon) break;
  }
  return out;
}

/* Asked at the switch, answered honestly: false means the learner said no and
   the switch must stay off rather than lie about being on. */
export async function askPermission() {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur && cur.granted) return true;
    const got = await Notifications.requestPermissionsAsync();
    return !!(got && got.granted);
  } catch {
    return false;
  }
}

/* Re-arm from scratch: cancel everything, then lay down the window. Cancelling
   all of it is safe precisely because this is the only thing that schedules. */
export async function arm(st, minutes) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!Number.isFinite(minutes)) return 0;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Daily reminder",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const times = nextTimes(st, minutes);
    for (const date of times) {
      await Notifications.scheduleNotificationAsync({
        content: { title: TITLE, body: BODY },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
      });
    }
    return times.length;
  } catch {
    return 0;
  }
}

export async function clear() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* nothing to say and nowhere to say it */
  }
}
