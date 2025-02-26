//META{"name":"CountdownStatus","source":"https://github.com/CryoPhynix/Animated-Countdown-Status/blob/main/Animated_Status.plugin.js","website":"https://github.com/CryoPhynix/Animated-Countdown-Status"}*//

class CountdownStatus {
    constructor() {
        /**
         * Update interval in ms
         * (2 seconds = 2000). Adjust if you’re hitting rate limits or want a slower animation flip.
         */
        this.updateInterval = 2000;

        // Hourglass frames for animation
        this.hourglassFrames = ["⏳", "⌛"];
        this.hourglassIndex = 0;

        // Plugin metadata
        this.pluginName = "Animated Countdown Status";
        this.pluginDescription = "Displays a live countdown to a date/time (with custom label).";
        this.pluginVersion = "1.4.0";
        this.pluginAuthor = "Phynix";
    }

    getName() { return this.pluginName; }
    getDescription() { return this.pluginDescription; }
    getVersion() { return this.pluginVersion; }
    getAuthor() { return this.pluginAuthor; }

    load() {
        // Load the target date or default to January 7, 2025
        this.targetDateString = BdApi.getData("CountdownStatus", "targetDateString") || "2025-01-07T00:00:00";
        // Load the custom label or default to empty (which shows date)
        this.targetLabelString = BdApi.getData("CountdownStatus", "targetLabelString") || "";

        // Grab internal Webpack modules to get the Discord token & user
        this.modules = this.modules || (() => {
            let m = [];
            webpackChunkdiscord_app.push([['CountdownStatus'], {}, e => {
                m = m.concat(Object.values(e.c || {}));
            }]);
            return m;
        })();

        // Extract the token and user info
        const tokenModule = this.modules.find(mod => mod.exports?.default?.getToken !== void 0);
        const userModule = this.modules.find(mod => mod.exports?.default?.getCurrentUser !== void 0);

        this.authToken = tokenModule?.exports.default.getToken();
        this.currentUser = userModule?.exports.default.getCurrentUser();

        // Log for debugging
        console.log("[CountdownStatus] Auth Token:", this.authToken);
        console.log("[CountdownStatus] Current User:", this.currentUser);
    }

    start() {
        // Start the update loop
        this.updateStatus();
        this.intervalHandle = setInterval(() => this.updateStatus(), this.updateInterval);
    }

    stop() {
        if (this.intervalHandle) clearInterval(this.intervalHandle);
        // Optionally clear the custom status on plugin stop
        this.setStatus(null);
    }

    /**
     * Build a string like "5d 12h 34m 56s until My Event"
     * or fall back to the date if the label is empty.
     */
    getCountdownString() {
        const now = Date.now();
        const targetTime = new Date(this.targetDateString).getTime();
        const diff = targetTime - now;

        // If the date is invalid
        if (isNaN(targetTime)) {
            return "Invalid target date!";
        }
        // If the countdown has passed
        if (diff <= 0) {
            return "Countdown finished!";
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        // If we have a custom label, use it; otherwise, show the date/time
        const label = this.targetLabelString.trim().length > 0
            ? this.targetLabelString.trim()
            : new Date(this.targetDateString).toLocaleString();

        return `${days}d ${hours}h ${minutes}m ${seconds}s until ${label}`;
    }

    /**
     * Core function that updates the status with the countdown + hourglass
     */
    updateStatus() {
        // Pick the current hourglass frame and increment to animate next time
        const hourglass = this.hourglassFrames[this.hourglassIndex];
        this.hourglassIndex = (this.hourglassIndex + 1) % this.hourglassFrames.length;

        // Construct the text, e.g. "⏳ 5d 12h 34m 56s until My Event"
        const text = `${hourglass} ${this.getCountdownString()}`;

        // Make the PATCH request to Discord
        const req = new XMLHttpRequest();
        req.open("PATCH", "/api/v9/users/@me/settings", true);
        req.setRequestHeader("authorization", this.authToken);
        req.setRequestHeader("content-type", "application/json");

        req.onload = () => {
            console.log("[CountdownStatus] PATCH response status:", req.status);
            console.log("[CountdownStatus] PATCH response text:", req.responseText);

            if (req.status >= 400) {
                // Attempt to parse Discord's error message
                let errMsg;
                try {
                    const resJson = JSON.parse(req.responseText);
                    errMsg = resJson?.message || req.responseText;
                } catch (err) {
                    errMsg = req.responseText;
                }

                // Handle specific codes
                if (req.status === 401) {
                    BdApi.showToast(`CountdownStatus: Unauthorized (401). Token may be invalid.\n${errMsg}`, { type: "error" });
                } else if (req.status === 429) {
                    BdApi.showToast(`CountdownStatus: Rate-limited (429). Slow down updates.\n${errMsg}`, { type: "error" });
                } else {
                    BdApi.showToast(`CountdownStatus: Error [${req.status}]\n${errMsg}`, { type: "error" });
                }
            }
        };

        req.send(JSON.stringify({
            custom_status: {
                text,
                emoji_name: "",
                expires_at: null
            }
        }));
    }

    /**
     * Helper to clear or set custom status
     */
    setStatus(status) {
        const req = new XMLHttpRequest();
        req.open("PATCH", "/api/v9/users/@me/settings", true);
        req.setRequestHeader("authorization", this.authToken);
        req.setRequestHeader("content-type", "application/json");

        req.onload = () => {
            if (req.status >= 400) {
                let errMsg;
                try {
                    const resJson = JSON.parse(req.responseText);
                    errMsg = resJson?.message || req.responseText;
                } catch (err) {
                    errMsg = req.responseText;
                }
                BdApi.showToast(`CountdownStatus: Failed to set status [${req.status}]\n${errMsg}`, { type: "error" });
            }
        };

        req.send(JSON.stringify({ custom_status: status }));
    }

    /**
     * Settings panel: Allows user to set both the target date/time and a custom label
     */
    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";

        // --- Target Date/Time ---
        const dateLabel = document.createElement("h3");
        dateLabel.innerText = "Target Date/Time for Countdown:";
        panel.appendChild(dateLabel);

        const dateInput = document.createElement("input");
        dateInput.type = "text";
        dateInput.value = this.targetDateString;
        dateInput.placeholder = "e.g. 2025-01-07T00:00:00";
        dateInput.style.width = "250px";
        dateInput.style.marginRight = "10px";
        panel.appendChild(dateInput);

        // --- Custom Label ---
        const labelTitle = document.createElement("h3");
        labelTitle.innerText = "Custom Label (optional):";
        panel.appendChild(labelTitle);

        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.value = this.targetLabelString;
        labelInput.placeholder = "e.g. My Birthday, Vacation, etc.";
        labelInput.style.width = "250px";
        labelInput.style.marginRight = "10px";
        panel.appendChild(labelInput);

        // --- Save Button ---
        const btnSave = document.createElement("button");
        btnSave.innerText = "Save";
        btnSave.onclick = () => {
            BdApi.setData("CountdownStatus", "targetDateString", dateInput.value);
            BdApi.setData("CountdownStatus", "targetLabelString", labelInput.value);

            this.targetDateString = dateInput.value;
            this.targetLabelString = labelInput.value;

            BdApi.showToast("CountdownStatus: Settings updated!", { type: "success" });

            // Immediately trigger an update
            this.updateStatus();
        };
        panel.appendChild(btnSave);

        // --- Helpful note ---
        const note = document.createElement("p");
        note.innerHTML = `
            <br/>
            <strong>Notes:</strong>
            <ul>
                <li>Use any valid date/time (e.g. "2025-01-07" or "2025-01-07T14:30:00").</li>
                <li>If the label is blank, it will use the date/time in the status.</li>
                <li>Plugin updates status every 2 seconds by default.</li>
                <li>Open the DevTools console (Ctrl+Shift+I) to see detailed logs if there's an error.</li>
                <li>The hourglass emoji flips each update to show animation.</li>
            </ul>
        `;
        panel.appendChild(note);

        return panel;
    }
}
