/* The cast. Flat SVG so the app carries its own characters and works offline.
   Shared with the native app, which renders the same paths through react-native-svg
   rather than innerHTML. */
export const AV = {
  monkeynaut: { name: "Monkeynaut", bg: "#2E3A59", svg:
    '<circle cx="32" cy="35" r="19" fill="#A9744F"/>' +
    '<circle cx="13" cy="33" r="6" fill="#A9744F"/><circle cx="51" cy="33" r="6" fill="#A9744F"/>' +
    '<ellipse cx="32" cy="41" rx="11" ry="8.5" fill="#E8C39E"/>' +
    '<circle cx="27" cy="33" r="2.4" fill="#241a12"/><circle cx="37" cy="33" r="2.4" fill="#241a12"/>' +
    '<path d="M28 43q4 3 8 0" stroke="#8a5c3b" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="32" cy="34" r="23" fill="#BFE9FF" opacity=".22"/>' +
    '<circle cx="32" cy="34" r="23" fill="none" stroke="#DCF3FF" stroke-width="2.5"/>' +
    '<path d="M18 24q6-7 15-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>' },

  gymbun: { name: "Gym Bunny", bg: "#F6D3DF", svg:
    '<ellipse cx="24" cy="16" rx="5" ry="13" fill="#FFF6F0"/><ellipse cx="40" cy="16" rx="5" ry="13" fill="#FFF6F0"/>' +
    '<ellipse cx="24" cy="17" rx="2.2" ry="8" fill="#F5A9BE"/><ellipse cx="40" cy="17" rx="2.2" ry="8" fill="#F5A9BE"/>' +
    '<circle cx="32" cy="38" r="16" fill="#FFF6F0"/>' +
    '<circle cx="26" cy="36" r="2.4" fill="#3b2b2f"/><circle cx="38" cy="36" r="2.4" fill="#3b2b2f"/>' +
    '<path d="M32 41l-2.5 2.5h5z" fill="#F5A9BE"/>' +
    '<rect x="12" y="47" width="6" height="12" rx="2" fill="#4A4E57"/>' +
    '<rect x="46" y="47" width="6" height="12" rx="2" fill="#4A4E57"/>' +
    '<rect x="17" y="51" width="30" height="4" rx="2" fill="#6B7280"/>' },

  shadesduck: { name: "Cool Duck", bg: "#BFE3F5", svg:
    '<circle cx="32" cy="34" r="18" fill="#FFD34E"/>' +
    '<path d="M14 38q-6 2-6 5 0 3 7 3l8-4z" fill="#F08A2E"/>' +
    '<ellipse cx="30" cy="45" rx="12" ry="6" fill="#F5A623"/>' +
    '<rect x="19" y="27" width="27" height="9" rx="4.5" fill="#23252B"/>' +
    '<path d="M32 27v9" stroke="#BFE3F5" stroke-width="2"/>' +
    '<path d="M40 18q6-4 9 1" stroke="#F5A623" stroke-width="3" fill="none" stroke-linecap="round"/>' },

  djcat: { name: "DJ Cat", bg: "#2B2440", svg:
    '<path d="M18 24l2-12 11 7zM46 24l-2-12-11 7z" fill="#9AA3B0"/>' +
    '<circle cx="32" cy="36" r="17" fill="#9AA3B0"/>' +
    '<circle cx="26" cy="34" r="2.6" fill="#1f1b2b"/><circle cx="38" cy="34" r="2.6" fill="#1f1b2b"/>' +
    '<path d="M32 39l-2.5 2.5h5z" fill="#F79FB0"/>' +
    '<path d="M22 43q10 6 20 0" stroke="#5b6472" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M13 34a19 19 0 0 1 38 0" stroke="#F2545B" stroke-width="4" fill="none"/>' +
    '<rect x="7" y="30" width="9" height="14" rx="4.5" fill="#F2545B"/>' +
    '<rect x="48" y="30" width="9" height="14" rx="4.5" fill="#F2545B"/>' },

  scarfbear: { name: "Cosy Bear", bg: "#E8D6C0", svg:
    '<circle cx="17" cy="21" r="7" fill="#8B5E3C"/><circle cx="47" cy="21" r="7" fill="#8B5E3C"/>' +
    '<circle cx="17" cy="21" r="3.4" fill="#C89B78"/><circle cx="47" cy="21" r="3.4" fill="#C89B78"/>' +
    '<circle cx="32" cy="33" r="17" fill="#8B5E3C"/>' +
    '<ellipse cx="32" cy="39" rx="10" ry="7.5" fill="#D9B48F"/>' +
    '<circle cx="26" cy="31" r="2.4" fill="#2b1d13"/><circle cx="38" cy="31" r="2.4" fill="#2b1d13"/>' +
    '<ellipse cx="32" cy="36" rx="3" ry="2.2" fill="#2b1d13"/>' +
    '<path d="M12 50q20 8 40 0v8H12z" fill="#C0392B"/>' +
    '<rect x="10" y="46" width="44" height="7" rx="3.5" fill="#E0574A"/>' },

  profowl: { name: "Professor Owl", bg: "#C9E4C5", svg:
    '<path d="M16 18l5-8 6 7zM48 18l-5-8-6 7z" fill="#8D6E52"/>' +
    '<ellipse cx="32" cy="36" rx="19" ry="18" fill="#A67C52"/>' +
    '<ellipse cx="32" cy="41" rx="12" ry="12" fill="#D9BE9A"/>' +
    '<circle cx="24" cy="32" r="8" fill="#FFF9F0"/><circle cx="40" cy="32" r="8" fill="#FFF9F0"/>' +
    '<circle cx="24" cy="32" r="3.2" fill="#2c2a26"/><circle cx="40" cy="32" r="3.2" fill="#2c2a26"/>' +
    '<circle cx="24" cy="32" r="8" fill="none" stroke="#3E3A34" stroke-width="2.2"/>' +
    '<circle cx="40" cy="32" r="8" fill="none" stroke="#3E3A34" stroke-width="2.2"/>' +
    '<path d="M32 32h0M31 32h2" stroke="#3E3A34" stroke-width="2.2"/>' +
    '<path d="M32 38l-3 4h6z" fill="#E8A33D"/>' },

  kingfrog: { name: "Frog King", bg: "#CDEBC0", svg:
    '<circle cx="22" cy="24" r="8" fill="#5FBF6A"/><circle cx="42" cy="24" r="8" fill="#5FBF6A"/>' +
    '<circle cx="22" cy="24" r="4" fill="#fff"/><circle cx="42" cy="24" r="4" fill="#fff"/>' +
    '<circle cx="22" cy="25" r="2.1" fill="#22331f"/><circle cx="42" cy="25" r="2.1" fill="#22331f"/>' +
    '<ellipse cx="32" cy="41" rx="19" ry="15" fill="#5FBF6A"/>' +
    '<path d="M20 44q12 9 24 0" stroke="#2F6B37" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '<circle cx="21" cy="39" r="2.4" fill="#F29AA8" opacity=".8"/>' +
    '<circle cx="43" cy="39" r="2.4" fill="#F29AA8" opacity=".8"/>' +
    '<path d="M22 13l4 6 6-8 6 8 4-6 1 9H21z" fill="#F2C14E"/>' },

  bowtiepen: { name: "Penguin", bg: "#D6E9F5", svg:
    '<ellipse cx="32" cy="36" rx="18" ry="20" fill="#2B2F38"/>' +
    '<ellipse cx="32" cy="40" rx="11.5" ry="15" fill="#FFFDF7"/>' +
    '<circle cx="26" cy="30" r="2.5" fill="#2B2F38"/><circle cx="38" cy="30" r="2.5" fill="#2B2F38"/>' +
    '<path d="M32 33l-4 4 4 3 4-3z" fill="#F0932B"/>' +
    '<path d="M25 47l7 4 7-4-3-3h-8z" fill="#C0392B"/>' +
    '<circle cx="32" cy="47" r="2" fill="#8E2A20"/>' +
    '<path d="M12 42q4-8 6 0M52 42q-4-8-6 0" stroke="#2B2F38" stroke-width="3" fill="none" stroke-linecap="round"/>' },

  sneakfox: { name: "Sly Fox", bg: "#FFE0C2", svg:
    '<path d="M13 16l6 14 8-6zM51 16l-6 14-8-6z" fill="#E8743B"/>' +
    '<path d="M13 16l4 9 5-4zM51 16l-4 9-5-4z" fill="#FFF2E6"/>' +
    '<path d="M32 20c11 0 18 8 18 16s-8 14-18 14-18-6-18-14 7-16 18-16z" fill="#E8743B"/>' +
    '<path d="M32 34c6 0 10 4 10 8s-5 8-10 8-10-4-10-8 4-8 10-8z" fill="#FFF2E6"/>' +
    '<circle cx="25" cy="33" r="2.5" fill="#3a251b"/><circle cx="39" cy="33" r="2.5" fill="#3a251b"/>' +
    '<path d="M32 42l-3 2.5 3 2 3-2z" fill="#3a251b"/>' },

  spikelib: { name: "Hedgehog", bg: "#EADFD0", svg:
    '<path d="M32 12c12 0 20 9 20 19s-9 19-20 19-20-8-20-19S20 12 32 12z" fill="#7A6250"/>' +
    '<path d="M14 26l-6-4 7-1zM16 18l-4-6 7 2zM24 13l-1-7 5 5zM33 11l2-7 3 6zM43 14l5-5-1 7zM50 20l7-2-4 6zM53 29l7 1-6 4z" fill="#7A6250"/>' +
    '<ellipse cx="32" cy="42" rx="13" ry="11" fill="#E0C9AE"/>' +
    '<circle cx="27" cy="39" r="2.3" fill="#33281f"/><circle cx="37" cy="39" r="2.3" fill="#33281f"/>' +
    '<ellipse cx="32" cy="46" rx="3" ry="2.4" fill="#33281f"/>' },
};
export const AV_IDS = Object.keys(AV);
