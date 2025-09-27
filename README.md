A module for Foundry VTT that adds 2x/3x Advantage and Disadvantage buttons to DnD5e roll dialogs for use with Midi-QOL to facilitate stacking advantage.

### Definitions
- **2x Advantage:** roll 3d20 and keep the highest roll
- **3x Advantage:** roll 4d20 and keep the highest roll
- **2x Disadvantage:** roll 3d20 and keep the lowest roll
- **3x Disadvantage:** roll 4d20 and keep the lowest roll

### Example
Screenshot of the extended roll dialog:

![Screenshot of the extended roll dialog.](/assets/roll_dialog.jpg)

Screenshot of the chat messages corresponding to 2x dis-/advantage rolls:

![Screenshot of the chat messages corresponding to 2x dis-/advantage rolls.](/assets/chat_message.jpg)

### Dependencies
- **Foundry:** tested for Foundry VTT v12.334 and v13.348
- **D&D5e (System):** tested for version 4.4+ and up to 5.1.9
- **MidiQOL:** tested for versions 12.X and up to 13.0.26 

### Example Rule
When a d20 roll involves more than one instance of advantage and/or disadvantage, add up the instances of advantage and subtract the instances of disadvantage.

- **Result of 0:** The roll proceeds as normal, as there are just as many instances of advantage as there are of disadvantage.
- **Positive Result of X:** The roll proceeds with advantage. Roll **X** additional d20s and choose the highest one. This is limited to at most 3 additional d20s.
- **Negative Result of -X:** The roll proceeds with disadvantage. Roll **X** additional d20s and choose the lowest one. This is limited to at most 3 additional d20s.

#### Passive Checks

Stacking Advantage and Disadvantage also affects Passive Checks as outlined below.

| **Stacks** | **Advantage** | **Disadvantage** |
|------------|---------------|------------------|
| 1x         | +5            | -5               |
| 2x         | +8            | -8               |
| 3x         | +10           | -10              |

