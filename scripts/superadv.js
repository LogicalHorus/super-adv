// superadv.js

// create a private scope for the module to prevent global variable conflicts
(() => {
    // module prefix
    const mPrefix = 'super-adv';
    // custom error logging function that prefixes messages with the module name
    const err = (...args) => console.error(`${mPrefix} |`, ...args);

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
                const map = {
                    adv2: { mode: ADV, count: 3, keep: 'kh', label: '2× Advantage' },
                    adv3: { mode: ADV, count: 4, keep: 'kh', label: '3× Advantage' },
                    dis2: { mode: DIS, count: 3, keep: 'kl', label: '2× Disadvantage' },
                    dis3: { mode: DIS, count: 4, keep: 'kl', label: '3× Disadvantage' }
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
                            // set the number of d20s to roll
                            d20.number = cfg.count;
                            // remove any existing "keep highest/lowest" (= dis-/advantage) modifiers
                            d20.modifiers = d20.modifiers.filter(m => !(m === 'kh' || m === 'kl'));
                            // add the new dis-/advantage mdifier
                            d20.modifiers.push(cfg.keep);
                        }

                        // rebuild the roll formula with the new dice count and modifiers
                        roll.resetFormula();
                        // set a custom label for the roll mode (TODO: seems to get ignored)
                        roll.options.rollModeLabel = cfg.label;
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
        } catch (e) {
            // log a fatal error if the initial patching fails
            err('Fatal error during patching:', e);
        }
    });
})();
