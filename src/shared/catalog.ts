/**
 * Ids Easy Anim knows from its sibling tools. Unknown ids are warnings, not errors: your own Easy Sprite sheets,
 * Easy FX effects, Easy SFX sounds and Easy Music songs work too.
 */

/** Easy Sprite native side-view sheets: 48px frames, 30 columns, rows right/left/front. */
export const SPRITES = [
  "side_hijab_teacher", "side_kopiah_boy", "side_market_seller", "side_grandma", "side_little_boy", "side_school_girl",
  "side_tadika_girl", "side_village_farmer", "side_pelekat_fisher", "side_teen_runner", "side_temple_monk",
  "side_young_knight", "side_pet_chicken", "side_pet_dog",
] as const;

/** Easy FX presets. */
export const FX = [
  "hit_sparks", "slash_arc", "explosion_small", "explosion_big", "dust_puff", "footstep_dust", "smoke", "torch_fire", "campfire",
  "embers", "water_splash", "rain", "falling_leaves", "fireflies", "sparkle_shine", "coin_burst", "heal_plus", "level_up",
  "magic_swirl", "confetti", "steam", "lantern_glow", "khom_loi", "krathong_glow", "songkran_splash", "incense_smoke",
  "pelita_flicker", "raya_fireworks",
] as const;

/** Easy SFX village bank sounds. */
export const SFX = [
  "coin", "jump", "hit", "hurt", "powerup", "select", "confirm", "blip", "footstep", "door", "explosion", "blip_mid", "blip_kid",
  "blip_auntie", "blip_monk", "blip_elder", "rebana", "rebana_pak", "rammana",
] as const;

/** Easy Music presets. */
export const MUSIC = [
  "village_day", "rice_field_breeze", "market_bustle", "shop_theme", "temple_calm", "shrine_lanterns", "night_village", "river_boat",
  "loy_krathong", "songkran_splash", "raya_kompang", "raya_open_house", "battle_chip", "battle_ranat", "title_theme",
] as const;

/** Placeholder colours per known sprite (the real sheets come from Easy Sprite). */
export const SPRITE_COLORS: Record<string, { skin: string; hair: string; top: string; bottom: string; hat?: "hijab" | "kopiah" | "bald" | "bun" | "cap" }> = {
  side_hijab_teacher: { skin: "#c9956c", hair: "#2f7a6a", top: "#e6d3a3", bottom: "#2f5a6e", hat: "hijab" },
  side_kopiah_boy: { skin: "#b07850", hair: "#1f1a18", top: "#f2efe4", bottom: "#3a4a6a", hat: "kopiah" },
  side_market_seller: { skin: "#d8a878", hair: "#2a201a", top: "#d0503c", bottom: "#5a3a2a", hat: "bun" },
  side_grandma: { skin: "#c49068", hair: "#d8d4cc", top: "#8a5aa0", bottom: "#4a3a5a", hat: "bun" },
  side_little_boy: { skin: "#d0a070", hair: "#2a1e18", top: "#f4ae3d", bottom: "#3a5a8a" },
  side_school_girl: { skin: "#e0b088", hair: "#1e1814", top: "#f6f2ea", bottom: "#2a3a6a" },
  side_tadika_girl: { skin: "#c08a60", hair: "#e8c8d8", top: "#e88aa8", bottom: "#f2e6ee", hat: "hijab" },
  side_village_farmer: { skin: "#a87048", hair: "#2a2018", top: "#4a7a4a", bottom: "#6a5a3a", hat: "cap" },
  side_pelekat_fisher: { skin: "#a06a44", hair: "#1e1814", top: "#d8d0b8", bottom: "#3a6a5a", hat: "kopiah" },
  side_teen_runner: { skin: "#d8a878", hair: "#3a2a20", top: "#4fa3d9", bottom: "#2a2a3a" },
  side_temple_monk: { skin: "#c49068", hair: "#c49068", top: "#e88a2a", bottom: "#d07020", hat: "bald" },
  side_young_knight: { skin: "#e0b088", hair: "#6a4a2a", top: "#8a9aaa", bottom: "#4a5a6a" },
};
