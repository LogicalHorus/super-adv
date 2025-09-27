// superadv.js
/* global game, Hooks, CONFIG */

(() => {
    const LOGP = "SuperAdv";
    const log = (...args) => console.log(`${LOGP} |`, ...args);
    const warn = (...args) => console.warn(`${LOGP} |`, ...args);
    const err = (...args) => console.error(`${LOGP} |`, ...args);

    Hooks.once("ready", () => {

        try {
            const D20Roll = CONFIG.Dice.D20Roll;
            const DialogClass = D20Roll.DefaultConfigurationDialog;
            if (!DialogClass) return err("DialogClass missing.");

            // --- Patch buttons context ---
            const origPrepareButtons = DialogClass.prototype._prepareButtonsContext;
            DialogClass.prototype._prepareButtonsContext = async function(context, options) {

                const out = await origPrepareButtons.call(this, context, options);

                out.buttons = out.buttons ?? {};
                const injected = {
                    adv3:  { label: "3× Adv",   icon: '<i class="fa-solid fa-arrow-up-wide-short" inert></i>', default: false },
                    adv2:  { label: "2× Adv",   icon: '<i class="fa-solid fa-arrow-up-wide-short" inert></i>', default: false },
                    dis2:  { label: "2× Disadv",icon: '<i class="fa-solid fa-arrow-down-wide-short" inert></i>', default: false },
                    dis3:  { label: "3× Disadv",icon: '<i class="fa-solid fa-arrow-down-wide-short" inert></i>', default: false }
                };

                for (const [k,v] of Object.entries(injected)) {
                    if (!(k in out.buttons)) out.buttons[k] = v;
                }

                if (this.element) {
                    this.element.classList.add("super-adv-injected");
                    setTimeout(() => {
                        const container = this.element[0]?.querySelector(".dialog-buttons") || this.element.querySelector(".dialog-buttons");
                        if (!container) return;

                        const row = document.createElement("div");
                        row.className = "super-adv-row";

                        Object.keys(injected).forEach(key => {
                            const btn = container.querySelector(`button[data-action="${key}"]`);
                            if (btn) {
                                container.removeChild(btn);
                                row.appendChild(btn);
                                btn.classList.add("super-adv-btn");
                            }
                        });

                        container.appendChild(row);
                    }, 0);
                }

                return out;
            };

            // --- Patch finalize rolls ---
            const origFinalize = DialogClass.prototype._finalizeRolls;
            DialogClass.prototype._finalizeRolls = function(action) {

                const ADV = D20Roll.ADV_MODE?.ADVANTAGE ?? 1;
                const DIS = D20Roll.ADV_MODE?.DISADVANTAGE ?? -1;

                const map = {
                    adv2: { mode: ADV, count: 3, keep: "kh", label: "2× Advantage" },
                    adv3: { mode: ADV, count: 4, keep: "kh", label: "3× Advantage" },
                    dis2: { mode: DIS, count: 3, keep: "kl", label: "2× Disadvantage" },
                    dis3: { mode: DIS, count: 4, keep: "kl", label: "3× Disadvantage" }
                };

                if (!map[action]) return origFinalize.call(this, action);

                const cfg = map[action];

                this.rolls.forEach((roll, idx) => {
                    try {
                        roll.options ??= {};
                        roll.options.advantageMode = cfg.mode;
                        roll.configureModifiers();
                        if (roll?.d20) {
                            const d20 = roll.d20;
                            const before = { number: d20.number, modifiers: [...d20.modifiers] };
                            d20.number = cfg.count;
                            d20.modifiers = d20.modifiers.filter(m => !(m === "kh" || m === "kl"));
                            d20.modifiers.push(cfg.keep);
                        }
                        roll.resetFormula();

                        roll.options.rollModeLabel = cfg.label;
                        roll.options.configured = true;
                    } catch (e) {
                        err(`[roll ${idx}] error while applying super-adv:`, e);
                    }
                });
                return this.rolls;
            };

        } catch (e) {
            err("Fatal error during patching:", e);
        }
    });
})();
