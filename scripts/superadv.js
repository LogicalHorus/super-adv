// superadv.js

// create a private scope for the module to prevent global variable conflicts
(() => {
    // module prefix
    const mPrefix = 'super-adv';
    // custom error logging function that prefixes messages with the module name
    const err = (...args) => console.error(`${mPrefix} |`, ...args);
    // roll option that marks a roll as a super dis-/advantage roll and stores how many instances it represents
    const STACK_KEY = 'superAdvStacks';

    // build the dis-/advantage wording for a single roll
    // returns the plain label used by the system ('Advantage') alongside the super
    // dis-/advantage one ('2× Advantage'), or null if the roll is not a super dis-/advantage roll
    const rollLabels = roll => {
        // rolls made with the regular buttons carry no stack count
        const stacks = roll?.options?.[STACK_KEY];
        if (!stacks) {return null;}

        // pick the wording that matches the direction of the roll
        const dis = roll.options.advantageMode === CONFIG.Dice.D20Roll?.ADV_MODE?.DISADVANTAGE;
        const plain = game.i18n.localize(dis ? 'DND5E.Disadvantage' : 'DND5E.Advantage');

        return { plain, label: `${stacks}× ${plain}` };
    };

    // swap the plain dis-/advantage wording of a piece of text for the super one
    // text that already carries the super label is returned unchanged, so that it is safe
    // to run this repeatedly on the same content (chat cards get rendered again and again)
    const relabel = (text, labels) => {
        if (text.includes(labels.label) || !text.includes(labels.plain)) {return text;}
        return text.replaceAll(labels.plain, labels.label);
    };

    // build the dis-/advantage wording shared by every d20 roll of a chat message
    // returns null if the message holds no d20 roll, a regular one, or a mix of different modes,
    // because in those cases there is no single label that would describe the whole message
    const messageLabels = rolls => {
        let shared = null;

        for (const roll of rolls ?? []) {
            // skip anything that is not a d20 roll (damage rolls, ...)
            if (roll?.options?.advantageMode === undefined) {continue;}

            // bail out as soon as a roll is not part of the same super dis-/advantage mode
            const current = rollLabels(roll);
            if (!current || (shared && current.label !== shared.label)) {return null;}

            shared = current;
        }

        return shared;
    };

    // rolls travel as documents, plain objects or json strings, depending on where they come from
    const parseRolls = rolls => rolls?.map(roll => typeof roll === 'string' ? JSON.parse(roll) : roll);

    // rewrite the dis-/advantage labels that are baked into the stored html of a chat message
    // only text between tags is touched, so that markup and attributes stay exactly as they are
    // returns null if there is nothing to relabel
    const relabelContent = (content, labels) => {
        if (!labels || typeof content !== 'string') {return null;}

        const out = content.replace(/>([^<]+)</g, (match, text) => `>${relabel(text, labels)}<`);

        return out === content ? null : out;
    };

    // patch the roll dialog only after the game has been initialized
    Hooks.once('ready', () => {
        try {
            // get the d20 roll configuration object and the default dialog class associated with it
            const d20Roll = CONFIG.Dice.D20Roll;
            const dialogClass = d20Roll.DefaultConfigurationDialog;
            // make sure the dialog class exists
            if (!dialogClass) {return err('DialogClass missing.');}

            // --- SUPER-ADV BUTTONS ---
            // store the original button context preparation to call later
            const origPrepareButtons = dialogClass.prototype._prepareButtonsContext;

            // overwrite the button context preparation function to add new buttons to the d20 roll dialog
            dialogClass.prototype._prepareButtonsContext = async function(context, options) {
                // call the original function to get the default button context
                const out = await origPrepareButtons.call(this, context, options);

                // ensure that the 'buttons' property exists and is initialized
                out.buttons ??= {};

                // define the new super dis-/advantage buttons
                const advButtons = {
                    adv3:  {
                        label: '3× Adv',
                        icon: '<i class="fa-solid fa-arrow-up-wide-short" inert></i>',
                        default: false
                    },
                    adv2:  {
                        label: '2× Adv',
                        icon: '<i class="fa-solid fa-arrow-up-wide-short" inert></i>',
                        default: false
                    },
                    dis2:  {
                        label: '2× Disadv',
                        icon: '<i class="fa-solid fa-arrow-down-wide-short" inert></i>',
                        default: false
                    },
                    dis3:  {
                        label: '3× Disadv',
                        icon: '<i class="fa-solid fa-arrow-down-wide-short" inert></i>',
                        default: false
                    }
                };

                // add the new buttons to the existing buttons object if they don't already exist
                for (const [key, buttonDef] of Object.entries(advButtons)) {
                    if (!out.buttons.hasOwnProperty(key)) {out.buttons[key] = buttonDef;}
                }

                // if the dialog element exists, add a row with the new buttons
                if (this.element) {
                    // add a class to the dialog to allow for custom styling
                    this.element.classList.add(`${mPrefix}-injected`);

                    // make sure the DOM elements required for the new buttons have been rendered
                    setTimeout(() => {
                        // find the container for the dialog buttons
                        const buttonContainer = this.element[0]?.querySelector('.dialog-buttons')
                            || this.element.querySelector('.dialog-buttons');
                        if (!buttonContainer) {return;}

                        // create a new row to hold the super dis-/advantage buttons
                        const row = document.createElement('div');
                        row.className = `${mPrefix}-row`;

                        // move each new button to the super dis-/advantage row
                        Object.keys(advButtons).forEach(key => {
                            // find the button element by its data-action attribute
                            const btn = buttonContainer.querySelector(`button[data-action='${key}']`);
                            if (btn) {
                                // remove the button from its original position and add it to the new row
                                buttonContainer.removeChild(btn);
                                row.appendChild(btn);
                                // add a class for styling
                                btn.classList.add(`${mPrefix}-btn`);
                            }
                        });

                        // append the new row to the dialog button container
                        buttonContainer.appendChild(row);
                    }, 0);
                }

                return out;
            };

            // --- PATCH ROLLS ---
            // store the original finalize rolls method
            const origFinalize = dialogClass.prototype._finalizeRolls;

            // overwrite the finalize rolls method to handle the new super dis-/advantage button actions
            dialogClass.prototype._finalizeRolls = function(action) {
                // get the standard advantage and disadvantage mode values from the d20Roll configuration
                const ADV = d20Roll.ADV_MODE?.ADVANTAGE ?? 1;
                const DIS = d20Roll.ADV_MODE?.DISADVANTAGE ?? -1;

                // define a mapping of super dis-/advantage button actions to roll configurations
                // count  = the number of d20s to roll, before Elven Accuracy is taken into account
                // keep   = the legacy "keep highest/lowest" modifier (dnd5e 4.x only, see below)
                // stacks = how many instances of dis-/advantage the roll represents, used for the chat label
                const map = {
                    adv2: { mode: ADV, count: 3, keep: 'kh', stacks: 2 },
                    adv3: { mode: ADV, count: 4, keep: 'kh', stacks: 3 },
                    dis2: { mode: DIS, count: 3, keep: 'kl', stacks: 2 },
                    dis3: { mode: DIS, count: 4, keep: 'kl', stacks: 3 }
                };

                // if the current action is not one of the new ones, call the original method
                if (!map?.[action]) {return origFinalize.call(this, action);}

                // get the configuration of the current action
                const cfg = map[action];

                // iterate through each roll in the dialog
                this.rolls.forEach((roll, idx) => {
                    try {
                        // ensure that the options object exists and is initialized
                        roll.options ??= {};
                        // set the roll mode to advantage or disadvantage
                        roll.options.advantageMode = cfg.mode;
                        // configure roll modifiers based on the new mode
                        roll.configureModifiers();

                        // if there is a d20 roll present, configure the super dis/-advantage rolling
                        if (roll?.d20) {
                            const d20 = roll.d20;
                            // remove every dis-/advantage modifier that configureModifiers() just applied,
                            // in both the modern ('adv'/'dis', optionally with a count) and the legacy ('kh'/'kl') notation
                            d20.modifiers = d20.modifiers.filter(m => !/^(adv|dis)\d*$/i.test(m) && m !== 'kh' && m !== 'kl');

                            // Elven Accuracy adds one more d20 on top of the super advantage dice, exactly
                            // like it adds one to a regular advantage roll. it never applies to disadvantage.
                            // whether the character has it and whether it applies to this roll at all (it is
                            // limited to dex, int, wis and cha) has already been decided by the system
                            const elvenAccuracy = cfg.mode === ADV && roll.options.elvenAccuracy === true;
                            // the total number of d20s that should end up being rolled
                            const count = cfg.count + (elvenAccuracy ? 1 : 0);

                            // dnd5e 5.x (Foundry v14) expresses dis-/advantage as an 'advN'/'disN' die modifier:
                            // the die is expanded to (N + 1) dice at evaluation time and the best/worst one is kept.
                            // that means the die count has to stay at 1 - setting it manually would get multiplied,
                            // e.g. 3 dice with a plain 'adv' modifier would roll (1 + 1) * 3 = 6 dice
                            if ('adv' in (d20.constructor?.MODIFIERS ?? {})) {
                                // roll a single d20 ...
                                d20.number = 1;
                                // ... and let the modifier expand it to the full dice count, keeping the highest/lowest
                                d20.modifiers.push(`${cfg.mode === ADV ? 'adv' : 'dis'}${count - 1}`);
                            }
                            // dnd5e 4.x rolls all dice up front and picks the highest/lowest via 'kh'/'kl'
                            else {
                                // set the number of d20s to roll
                                d20.number = count;
                                // add the dis-/advantage modifier
                                d20.modifiers.push(cfg.keep);
                            }
                        }

                        // rebuild the roll formula with the new dice count and modifiers
                        roll.resetFormula();
                        // mark the roll as a super dis-/advantage roll so that the chat labels can pick it up
                        // (roll options are stored with the chat message, so this survives a reload)
                        roll.options[STACK_KEY] = cfg.stacks;
                        // mark the roll as "configured" to prevent further changes
                        roll.options.configured = true;
                    } catch (e) {
                        // log any errors that occur during the roll modification
                        err(`[roll ${idx}] error while applying super-adv:`, e);
                    }
                });
                // finally return the modified rolls
                return this.rolls;
            };

            // --- PATCH CHAT CARD CONTENT ---
            // chat cards of other modules (e.g. Midi-QOL) build their roll labels from the plain
            // advantage mode of a roll, which only knows regular dis-/advantage, and bake the
            // result into the stored card html. the label is therefore rewritten while the card is
            // being saved, never on the rendered card: mutating a rendered card makes other modules
            // redraw it from its stored html, which undoes the label and can lock up the client
            Hooks.on('preCreateChatMessage', (message, data) => {
                try {
                    // relabel the card the message is created with
                    const content = relabelContent(data?.content ?? message.content, messageLabels(message.rolls));
                    if (content) {message.updateSource({ content });}
                } catch (e) {
                    // log any errors that occur while labeling the new chat message
                    err('error while labeling a new chat card:', e);
                }
            });

            Hooks.on('preUpdateChatMessage', (message, changes) => {
                try {
                    // nothing to do for updates that do not touch the card html
                    if (typeof changes?.content !== 'string') {return;}

                    // prefer the rolls that come with the update, but fall back to the stored ones,
                    // because the card html and its rolls are not always saved in the same update
                    const labels = messageLabels(parseRolls(changes.rolls)) ?? messageLabels(message.rolls);

                    // relabel the card the message is updated with
                    const content = relabelContent(changes.content, labels);
                    if (content) {changes.content = content;}
                } catch (e) {
                    // log any errors that occur while labeling the updated chat message
                    err(`[message ${message?.id}] error while labeling an updated chat card:`, e);
                }
            });
        } catch (e) {
            // log a fatal error if the initial patch
            // ing fails
            err('Fatal error during patching:', e);
        }

        // --- PATCH MESSAGE FLAVOR ---
        // patched on its own so that a failure here cannot take the patches above down with it
        try {
            // get the d20 roll configuration object and store its message data preparation method
            const d20Roll = CONFIG.Dice.D20Roll;
            const origPrepareMessage = d20Roll._prepareMessageData;

            // overwrite the message data preparation to replace the '(Advantage)' suffix that the
            // system appends to the message flavor with the super one, e.g. '(2× Advantage)'
            d20Roll._prepareMessageData = function(rolls, messageData) {
                // remember the flavor from before the system appends its own suffix
                const flavor = messageData.flavor;
                // call the original function to get the default message data
                const out = origPrepareMessage.call(this, rolls, messageData);

                // swap the suffix if all d20 rolls of the message share one super dis-/advantage mode
                const labels = messageLabels(rolls);
                if (labels) {messageData.flavor = `${flavor ?? ''} (${labels.label})`;}

                return out;
            };
        } catch (e) {
            // log an error if the message flavor cannot be patched
            err('Error while patching the message flavor:', e);
        }
    });
})();
