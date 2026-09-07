/* Conversation scenarios (ROADMAP P6.3): ten situations, each tied to the unit
 * whose vocabulary it leans on, so a scenario opens when its unit does. `prompt`
 * is what the Worker hands the model — the situation and the tutor's role in it;
 * `title`/`en` are what the learner sees. Pure data, shared by both apps. */

export const SCENARIOS = [
  { id: "meet", unit: "family", icon: "family", title: "Знакомство", en: "Meeting someone",
    prompt: "You are a friendly student the learner has just met at a language club. Introduce yourself briefly and ask who they are, where they live, who is in their family." },
  { id: "cafe", unit: "food", icon: "food", title: "В кафе", en: "At a café",
    prompt: "You are a waiter in a small café. The learner has just sat down. Take their order: what they want to eat and drink, and anything else." },
  { id: "flat", unit: "home", icon: "home", title: "Моя квартира", en: "My flat",
    prompt: "You are a friend visiting the learner's flat for the first time. Ask about the rooms, what is where, and what they like about it." },
  { id: "shop", unit: "clothes", icon: "clothes", title: "В магазине", en: "In a clothes shop",
    prompt: "You are a shop assistant in a clothes shop. Ask what the learner is looking for, what size and colour, and offer things." },
  { id: "way", unit: "city", icon: "city", title: "Как пройти?", en: "Asking the way",
    prompt: "You are a passer-by in a Russian town. The learner is lost. Ask where they need to go and give simple directions, one step at a time." },
  { id: "trip", unit: "travel", icon: "travel", title: "Поездка", en: "A trip",
    prompt: "You are a friend planning a trip with the learner. Ask where they want to go, how, when, and what to bring." },
  { id: "weather", unit: "nature", icon: "nature", title: "Погода", en: "The weather",
    prompt: "You are a neighbour chatting at the bus stop. Talk about today's weather and the season, and ask what the learner likes to do in it." },
  { id: "doctor", unit: "medicine", icon: "body", title: "У врача", en: "At the doctor's",
    prompt: "You are a doctor. The learner is your patient. Ask what hurts, since when, and give simple advice." },
  { id: "job", unit: "work", icon: "work", title: "Работа", en: "Talking about work",
    prompt: "You are a new colleague on the learner's first day. Ask what they do, where they worked before, and what they like about the job." },
  { id: "day", unit: "emotion", icon: "emotion", title: "Как дела?", en: "How was your day",
    prompt: "You are a close friend on the phone in the evening. Ask how the learner's day was, what they did, and how they feel about it." },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) || null;
