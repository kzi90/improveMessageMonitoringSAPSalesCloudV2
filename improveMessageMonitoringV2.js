// ==UserScript==
// @name         Verbesserung Nachrichtenüberwachung SAP Sales Cloud v2
// @match        https://*.crm.cloud.sap/*
// @grant        none
// @version      1.11
// ==/UserScript==

(function() {
    "use strict";

    console.log("--- USERSCRIPT improveMessageMonitoringV2 STARTED ---");

    const HOST = globalThis.location.host;

    const downloadAllErrorMessages = async () => {
        try {
            const inboundErrorMessagesData = await fetch(
                `https://${HOST}/sap/c4c/api/v1/inbound-data-connector-service/messages?$top=0&$orderby=messageHeader/adminData/updatedOn+desc&$filter=messageHeader/processingStatus+eq+ERROR&$exclude=messageRequest`
            ).then((res) => res.json());
            const inboundErrorMessages = inboundErrorMessagesData?.value;
            console.log("number of inbound error messages:", inboundErrorMessages?.length);

            let inboundErrorsOnly = "";

            for (const message of inboundErrorMessages) {
                console.log("process error message");
                const errorMessageSubMessageData = await fetch(
                    `https://${HOST}/sap/c4c/api/v1/inbound-data-connector-service/messages/${message.id}/requests`
                ).then((res) => res.json());
                message.subMessages = errorMessageSubMessageData?.value?.filter(
                    (subMessage) => subMessage.messageHeader.processingStatus === "ERROR"
                );
                message.subMessages = await Promise.all(
                    message.subMessages.map(async (subMessage) => {
                        const fetchUrl = `https://${HOST}/sap/c4c/api/v1/inbound-data-connector-service/messages/${message.id}/requests/${subMessage.messageHeader.id}`;
                        const errorMessageSubMessageDetailsData = await fetch(fetchUrl).then((res) => res.json());
                        const newSubMessage = errorMessageSubMessageDetailsData?.value;
                        inboundErrorsOnly +=
                            (newSubMessage?.error?.details?.[0]?.details?.map((d) => d.message)?.join("\n") ||
                                newSubMessage?.error?.details?.[0]?.message ||
                                newSubMessage?.error?.message) +
                            " | " +
                            message.id +
                            " | " +
                            subMessage.messageHeader.id +
                            "\n";
                        return newSubMessage;
                    })
                );
            }

            const outboundErrorMessagesData = await fetch(
                `https://${HOST}/sap/c4c/api/v1/outbound-data-connector-service/messages?$top=0&$orderby=messageHeader/adminData/updatedOn+desc&$filter=messageHeader/processingStatus+eq+ERROR&$exclude=messageRequest`
            ).then((res) => res.json());
            const outboundErrorMessages = outboundErrorMessagesData?.value;
            console.log("number of outbound error messages:", outboundErrorMessages?.length);

            let outboundErrorsOnly = "";

            for (const message of outboundErrorMessages) {
                console.log("process error message");
                const errorMessageSubMessageData = await fetch(
                    `https://${HOST}/sap/c4c/api/v1/outbound-data-connector-service/messages/${message.id}/requests`
                ).then((res) => res.json());
                message.subMessages = errorMessageSubMessageData?.value?.filter(
                    (subMessage) => subMessage.messageHeader.processingStatus === "ERROR"
                );
                message.subMessages = await Promise.all(
                    message.subMessages.map(async (subMessage) => {
                        const fetchUrl = `https://${HOST}/sap/c4c/api/v1/outbound-data-connector-service/messages/${message.id}/requests/${subMessage.messageHeader.id}`;
                        const errorMessageSubMessageDetailsData = await fetch(fetchUrl).then((res) => res.json());
                        const newSubMessage = errorMessageSubMessageDetailsData?.value;
                        outboundErrorsOnly +=
                            (newSubMessage?.error?.details?.[0]?.details?.map((d) => d.message)?.join("\n") ||
                                newSubMessage?.error?.details?.[0]?.message ||
                                newSubMessage?.error?.message) +
                            " | " +
                            message.id +
                            " | " +
                            subMessage.messageHeader.id +
                            "\n";
                        return newSubMessage;
                    })
                );
            }

            // Download all errors as json
            const jsonString = JSON.stringify({ Inbound: inboundErrorMessages, Outbound: outboundErrorMessages }, null, 2);
            let blob = new Blob([jsonString], { type: "application/json" });
            let url = globalThis.URL.createObjectURL(blob);
            let a = document.createElement("a");
            a.href = url;
            a.download = "errors.json";
            a.click();
            globalThis.URL.revokeObjectURL(url);
            // Download errormessages as errors.txt
            blob = new Blob(
                ["Inbound-Errors:\n" + inboundErrorsOnly.trim() + "\n\nOutbound-Errors:\n" + outboundErrorsOnly.trim()],
                { type: "text/plain" }
            );
            url = globalThis.URL.createObjectURL(blob);
            a.href = url;
            a.download = "errors.txt";
            a.click();
            globalThis.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error fetching messages:", error);
        }
    };

    const processMessageTable = () => {
        const table = document.querySelector("sap-crm-table");
        if (!table) return;

        console.log("Nachrichtentabelle gefunden, verarbeite...");

        const group = document?.querySelector("sap-crm-toggle-button-group");
        const incomingBtn = group
            ?.querySelector('sap-crm-toggle-button[icon="incoming_email"]')
            .shadowRoot?.querySelector("button");
        const outgoingBtn = group
            ?.querySelector('sap-crm-toggle-button[icon="outgoing_email"]')
            .shadowRoot?.querySelector("button");

        const isPressed = (btn) => !!btn && btn.getAttribute("aria-pressed") === "true";

        let direction;
        if (isPressed(incomingBtn)) {
            direction = "inbound";
            console.log("replace error texts for inbound messagetable...");
        } else if (isPressed(outgoingBtn)) {
            direction = "outbound";
            console.log("replace error texts for outbound messagetable...");
        } else {
            console.log("neither inbound nor outbound detected, skipping messagetable processing...");
            return;
        }

        const rows = table.querySelectorAll("sap-crm-table-row");
        for (const row of rows) {
            const messageId = row.id;
            const messageHeadId = row
                ?.querySelector("sap-crm-table-cell:nth-child(3)")
                ?.querySelector("sap-crm-link")
                ?.shadowRoot?.querySelector("a")?.textContent?.trim();
            const statusElement = row
                ?.querySelector("sap-crm-table-cell:nth-child(4)")
                ?.querySelector("sap-crm-tag")
                ?.shadowRoot?.querySelector("span");

            if (["Fehler", "ERROR"].includes(statusElement?.textContent?.trim()) && messageId) {
                const fetchUrl = `https://${HOST}/sap/c4c/api/v1/${direction}-data-connector-service/messages/${messageHeadId}/requests/${messageId}/errorData`;
                fetch(fetchUrl)
                    .then((response) => {
                        if (!response.ok) throw new Error(`HTTP-Fehler: ${response.status}`);
                        return response.json();
                    })
                    .then((data) => {
                        if (!statusElement) return;

                        const firstErrorDetails =
                            data?.value?.error?.details?.[0]?.details?.[0]?.message ||
                            data?.value?.error?.details?.[0]?.message ||
                            data?.value?.error?.message ||
                            "Fehlerdetails nicht verfügbar";

                        statusElement.textContent = firstErrorDetails;
                        statusElement.style.setProperty("min-width", "max-content", "important");
                        const tableCell = row.querySelector("sap-crm-table-cell:nth-child(4)");
                        tableCell?.style.setProperty("min-width", "max-content", "important");
                  			const tableCellDiv = tableCell?.querySelector("sap-crm-tag")?.shadowRoot?.querySelector("div");
                        tableCellDiv?.style.setProperty("text-transform", "unset", "important");
                        tableCellDiv?.style.setProperty("min-width", "max-content", "important");
                    })
                    .catch((error) => {
                        console.error(`Fehler bei Request für ID ${messageId}:`, error);
                    });
            }
        }

        const flexElement = document.querySelector('sap-crm-flex[slot="custom-actions"]');
        if (flexElement && !document.getElementById("downloadAllErrorsButton")) {
            const button = document.createElement("button");
            button.textContent = "Alle Fehler herunterladen (das kann einige Minuten dauern)";
            button.id = "downloadAllErrorsButton";
            button.style.cssText = "background-color: #fae5e5; color: #5a0404; font-weight: bold; border: 2px solid #5a0404; padding: 4px; border-radius: 5px; margin-right: 4px; cursor: pointer;";

            button.onclick = function(e) {
                e.preventDefault();
                downloadAllErrorMessages();
            };
            
            flexElement.insertBefore(button, flexElement.firstChild);
        }
    };

    let debounceTimeout;
    const debounceProcess = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            processMessageTable();
        }, 1000);
    };

    const observer = new MutationObserver(debounceProcess);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();