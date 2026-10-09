**The sea has swallowed the lower city. The Ashshell are climbing the seawall.**
**You are strapped into the saddle of HEKATON TYPE-04, a 28-meter, four-legged war machine.**
**Every step shakes the cockpit. Every shot heats the core. Push resonance to 100% and the machine's heartbeat becomes yours. OVERBEAT.**

GRANDSTRIDE is a first-person cockpit mech action game that runs in your browser. You never leave the saddle. You read the gauges, heed the warning lights, keep four legs planted, and hold the line.

*Made with extensive use of generative AI (Claude): the game code, the in-game and store text, the world setting and design documents, and the promotional art were created by AI under Team GRANDSTRIDE's direction, then play-tested, edited and approved by the team. No AI image-generation models and no AI-generated audio files are used: the game's visuals are drawn at runtime by AI-written three.js code, and every sound is synthesized live by AI-written Web Audio code. Full details in the AI disclosure below.*

### Features

- **Three missions, three bosses.**
  - **MISSION 01 "Shore City, Sector 7 Defense"**: 3 minutes, 12 Ashshell, then the Shell Lord.
  - **MISSION 02 "Shore City, Harbor Night Sweep"**: 4 minutes, 16 Ashshell (beetle, floater and the new charging **RAMSHELL**), then the **TWINSHELL**, a boss that changes into a second, faster form halfway through the fight. Unlocks when you clear MISSION 01.
  - **MISSION 03 "Shore City, Third Seawall: Storm Watch"**: 5 minutes on the tidal flats in a storm. Fog cuts your view, so you fight by your instruments. Stand still and plant all four legs for a **TREMOR SCAN** that widens the radar. Bring 3 observation towers online to win back visibility, watch out for the **HAZE** that jams your gauges, and face the **MAELSHELL**, a three-phase boss that swims under the mud. Unlocks when you clear MISSION 02.
- **Sidestep.** Hold a direction and hop sideways (`Space` + `A` / `D`, or BOOST + stick left / right). A RAMSHELL glows red before it charges: step aside, let it crash into a wall, and hit the weak point on its back.
- **HANGAR upgrades.** Every mission pays out **PARTS**. Spend them to upgrade **Legs, Core and Armor**, 5 levels each: more leg grip, less heat, more armor. Your progress is saved in your browser.
- **Medals, HARD mode and ASSIST.** Each mission has 3 medals (clear, rank A or better, clear while taking little damage). Cleared missions unlock **HARD** (tougher enemies, 1.5× PARTS). Lose the same mission twice in a row and you can relaunch in **ASSIST** mode (25% less damage taken; the rank medal is off while it is on).
- **Your first minute is guided.** On your first sortie Itsuka walks you through moving, turning, firing, dashing and jumping before the first enemy arrives.
- **Auto save.** PARTS, upgrades, medals and settings are saved the moment they change. Close the tab mid-mission and you still get the minimum reward next time.
- **Daily operations.** 3 new goals every day ("destroy 10 beetles", "clear with rank A or better" and so on). Complete them for PARTS, and come back on consecutive days for a **STREAK** bonus.
- **First-person cockpit, all the way.** The HUD is built into the cockpit: resonance meter, a grip readout for each of the four legs, core temperature gauge, and a warning-light panel.
- **Four legs, four grip gauges (FL / FR / RL / RR).** Turning, landing, sidestepping and taking hits wear down each leg separately. When a leg's grip hits zero, the machine leans, slows down and turns sluggishly until the leg recovers. Stand still to regain grip faster.
- **Resonance.** Walk with a steady rhythm and keep landing shots to raise it. Hit 100% and enter **OVERBEAT**, a short burst where the machine fights at full power.
- **Core temperature.** Dash, boost, sidestep and fire heat the reactor. Push too hard and a forced cooldown locks out firing, dashing and boosting at the worst possible moment.
- **Launch sequence.** The first time you press LAUNCH, the cockpit boots around you: saddle link, core online, leg grip check, fire control, radar, neural link. The gauges light up one by one, the hangar bay opens, and Control calls it: "HEKATON, LAUNCH." After that, you launch in about one second.
- **Radio from Control.** Itsuka, your mission controller, keeps you alive over the radio with warnings, callouts and the occasional dry remark.
- **Score and rank (S / A / B / C)** at the end of each mission. High scores are saved per mission in your browser.
- **Every sound is synthesized live.** Footsteps, cannon fire, alarms and engine hum are generated in real time with the Web Audio API. No audio files.
- **Plays on PC and phone.** Keyboard and mouse on desktop, virtual stick and buttons on touch screens.
- **Quality settings (Low / Mid / High) and an FPS display** (toggle with `F`), so you can tune it to your machine.

### Controls

| Action | PC | Touch |
|---|---|---|
| Move forward / back | `W` / `S` (or arrow keys) | Left virtual stick (up / down) |
| Turn | `A` / `D` (or arrow keys) | Left virtual stick (left / right) |
| Look / aim | Mouse | Drag on the right side of the screen |
| Fire | Left click (also `J` / `Enter`) | FIRE button |
| Dash | `Shift` (hold) | DASH button |
| Boost jump | `Space` | BOOST button |
| Sidestep | `Space` + `A` / `D` | BOOST button + stick left / right |
| Pause | `Esc` (also `P`) | II button |
| Select mission (title screen) | `←` / `→` | Tap the mission card |
| Open HANGAR (title screen) | `H` | HANGAR button |
| Skip launch sequence | Any key | Tap |

Tip: click the game screen once to capture the mouse. Press `Esc` to release it.

### System requirements and known limitations

- **This is a prototype.** Three missions, one weapon. Upgrades, PARTS, medals, daily goals and high scores are saved in your browser only: clearing site data or switching browser / device starts you from zero. Expect rough edges, balance changes and bugs.
- **Recommended browsers:** latest desktop Chrome or Edge. Firefox should work. Safari (macOS / iOS) works but is less tested.
- Requires WebGL. If you see "WEBGL UNAVAILABLE", turn on hardware acceleration in your browser settings.
- **Low-spec PC, laptop on battery, or phone?** Set Quality to **Low** in the settings and check the FPS display.
- On phones, play in **landscape** and use the fullscreen button. Older phones may run hot.
- On iPhone / iPad, sound starts after your first tap (browser rule).
- The game pauses automatically if you switch tabs or the window loses focus.
- Gauges, buttons and the results screen are labelled in English and Japanese, but Itsuka's radio messages and the mission briefing are currently in Japanese only.

### Development status and roadmap

GRANDSTRIDE is in early development by a small team. This browser prototype is a public test: **does piloting a four-legged machine feel heavy, readable and fun?**

Next on the list:

1. Leg swaps in the HANGAR (heavy legs, jump legs, anchor legs)
2. More Ashshell types and missions
3. Rider skill tree
4. **A Steam release.** The goal is a free demo on Steam, then Early Access. Follow this page to hear when the Steam page goes live.

**Feedback wanted.** Please tell us in the comments:
- Could you tell what the leg grip and warning lights meant without reading anything?
- Did the RAMSHELL's red glow give you enough warning to sidestep?
- In the MISSION 03 storm, did the tremor scan and the towers help you find your way?
- Did you reach OVERBEAT? How did it feel?
- Which upgrade did you buy first, and did it make a difference?
- What was your FPS, and on what device / browser?
- Anything that broke, confused you or felt bad.

GRANDSTRIDE is free to play. If you enjoyed it, a small tip (suggested $3) goes directly into building the next missions.

### Credits

- Design, development: Team GRANDSTRIDE
- Mission controller Itsuka: radio text
- Sound: all synthesized in real time with the Web Audio API
- **three.js r128** — Copyright © 2010–2021 three.js authors. Released under the **MIT License**. https://github.com/mrdoob/three.js/blob/r128/LICENSE
- Fonts: **Chakra Petch** (© 2018 The Chakra Petch Project Authors) and **Share Tech Mono** (© 2012 Carrois Type Design), SIL Open Font License 1.1
- Made with AI assistance (Claude). See the AI disclosure below.

### AI disclosure

This project was made with extensive use of generative AI (Claude).
- **Code:** written by an AI coding assistant under Team GRANDSTRIDE's direction, then play-tested and adjusted.
- **Text:** the store description, in-game text, Itsuka's radio lines, and the world setting and design documents were drafted by AI and edited and approved by the team.
- **Graphics:** no AI image-generation models were used. In-game visuals are drawn at runtime by AI-written three.js code. The cover and screenshots are captures of the game. The promotional banner, header and title card were composed as vector art (SVG) by an AI assistant.
- **Sound:** no AI-generated audio files. All sound is synthesized live with the Web Audio API by AI-written code.
- Team GRANDSTRIDE chose the concept, directed the work and made the final decisions.
