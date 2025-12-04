// ==UserScript==
// @name        Verbesserung Nachrichtenüberwachung Sales Cloud v2
// @match       https://*.crm.cloud.sap/*
// @grant       none
// @version     1.7
// @description Verbesserung der Nachrichtenüberwachung
// ==/UserScript==

"use strict";

const downloadAllErrorMessages = async () => {
    try {
        const inboundErrorMessagesData = await fetch(
            `https://${window.location.host}/sap/c4c/api/v1/inbound-data-connector-service/messages?$top=0&$orderby=messageHeader/adminData/updatedOn+desc&$filter=messageHeader/processingStatus+eq+ERROR&$exclude=messageRequest`
        ).then((res) => res.json());
        const inboundErrorMessages = inboundErrorMessagesData?.value;
        console.log("number of inbound error messages:", inboundErrorMessages?.length);

        let inboundErrorsOnly = "";

        for (const message of inboundErrorMessages) {
            console.log("process error message");
            const errorMessageSubMessageData = await fetch(
                `https://${window.location.host}/sap/c4c/api/v1/inbound-data-connector-service/messages/${message.id}/requests`
            ).then((res) => res.json());
            message.subMessages = errorMessageSubMessageData?.value?.filter(
                (subMessage) => subMessage.messageHeader.processingStatus === "ERROR"
            );
            message.subMessages = await Promise.all(
                message.subMessages.map(async (subMessage) => {
                    const fetchUrl = `https://${window.location.host}/sap/c4c/api/v1/inbound-data-connector-service/messages/${message.id}/requests/${subMessage.messageHeader.id}`;
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
            `https://${window.location.host}/sap/c4c/api/v1/outbound-data-connector-service/messages?$top=0&$orderby=messageHeader/adminData/updatedOn+desc&$filter=messageHeader/processingStatus+eq+ERROR&$exclude=messageRequest`
        ).then((res) => res.json());
        const outboundErrorMessages = outboundErrorMessagesData?.value;
        console.log("number of outbound error messages:", outboundErrorMessages?.length);

        let outboundErrorsOnly = "";

        for (const message of outboundErrorMessages) {
            console.log("process error message");
            const errorMessageSubMessageData = await fetch(
                `https://${window.location.host}/sap/c4c/api/v1/outbound-data-connector-service/messages/${message.id}/requests`
            ).then((res) => res.json());
            message.subMessages = errorMessageSubMessageData?.value?.filter(
                (subMessage) => subMessage.messageHeader.processingStatus === "ERROR"
            );
            message.subMessages = await Promise.all(
                message.subMessages.map(async (subMessage) => {
                    const fetchUrl = `https://${window.location.host}/sap/c4c/api/v1/outbound-data-connector-service/messages/${message.id}/requests/${subMessage.messageHeader.id}`;
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

        // Download all failed payloads as errors.json
        const jsonString = JSON.stringify({ Inbound: inboundErrorMessages, Outbound: outboundErrorMessages }, null, 2);
        let blob = new Blob([jsonString], { type: "application/json" });
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;
        a.download = "errorMessages.json";
        a.click();
        window.URL.revokeObjectURL(url);
        // Download errormessages as errors.txt
        blob = new Blob(
            ["Inbound-Errors:\n" + inboundErrorsOnly.trim() + "\n\nOutbound-Errors:\n" + outboundErrorsOnly.trim()],
            { type: "text/plain" }
        );
        url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = "errors.txt";
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error fetching messages:", error);
    }
};

const processMessageTable = () => {
    const table = document?.querySelector("sap-crm-table");

    const group =
        document?.querySelector('sap-crm-toggle-button-group[slot="right"]') ||
        document?.querySelector("sap-crm-toggle-button-group");
    const incomingBtn = group?.querySelector('sap-crm-toggle-button[icon="incoming_email"]').shadowRoot?.querySelector("button");
    const outgoingBtn = group?.querySelector('sap-crm-toggle-button[icon="outgoing_email"]').shadowRoot?.querySelector("button");

    const isPressed = (btn) => !!btn && btn.getAttribute("aria-pressed") === "true";

    let direction;
    if (isPressed(incomingBtn)) {
        direction = "inbound";
    } else if (isPressed(outgoingBtn)) {
        direction = "outbound";
    } else {
        console.log("neither inbound nor outbound selected, skipping...");
        direction = null;
    }

    if (table && direction) {
        console.log("replace error texts...");

        const rows = table.querySelectorAll("sap-crm-table-row");
        rows.forEach((row) => {
            const messageId = row
                ?.querySelector("sap-crm-table-cell:nth-child(2)")
                ?.querySelector("sap-crm-label")
                ?.textContent?.trim();
            const statusElement = row
                ?.querySelector("sap-crm-table-cell:nth-child(3)")
                ?.querySelector("sap-crm-tag")
                ?.shadowRoot?.querySelector("span");

            //console.log("messageId:", messageId, "-", statusElement?.textContent.trim());

            if (["Fehler", "ERROR"].includes(statusElement?.textContent?.trim()) && messageId) {
                const fetchUrl = `https://${window.location.host}/sap/c4c/api/v1/${direction}-data-connector-service/messages/${messageId}/requests`;
                fetch(fetchUrl)
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error(`HTTP-Fehler: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then((data) => {
                        const subMessagesWithErrorsIds = data?.value
                            ?.filter((message) => message.messageHeader.processingStatus === "ERROR")
                            .map((message) => ({
                                externalId:
                                    message.entityKey.externalId?.localId ||
                                    message.entityKey.externalReferenceKey?.displayId,
                                subMessageId: message.messageHeader.id
                            }));
                        //console.log(subMessagesWithErrorsIds);
                        return subMessagesWithErrorsIds;
                    })
                    .then((subMessagesWithErrorsIds) => {
                        const subMessageIdToFetch = subMessagesWithErrorsIds[0]?.subMessageId;
                        const fetchUrl = `https://${window.location.host}/sap/c4c/api/v1/${direction}-data-connector-service/messages/${messageId}/requests/${subMessageIdToFetch}`;
                        fetch(fetchUrl)
                            .then((response) => {
                                if (!response.ok) {
                                    throw new Error(`HTTP-Fehler: ${response.status}`);
                                }
                                return response.json();
                            })
                            .then((data) => {
                                const firstErrorDetails =
                                    data?.value?.error?.details?.[0]?.details?.[0]?.message ||
                                    data?.value?.error?.details?.[0]?.message ||
                                    data?.value?.error?.message ||
                                    "Fehlerdetails nicht verfügbar";
                                statusElement.textContent = firstErrorDetails;
                                row.querySelector("sap-crm-tag")
                                    ?.shadowRoot?.querySelector("div")
                                    ?.style.setProperty("max-width", "unset", "important");
                                row.querySelector("sap-crm-tag")
                                    ?.shadowRoot?.querySelector("div")
                                    ?.style.setProperty("text-transform", "unset", "important");
                            })
                            .catch((error) => {
                                console.error(`Fehler beim Submessage-API-Request ( ${fetchUrl} ):`, error);
                            });
                    })
                    .catch((error) => {
                        console.error(`Fehler beim Message-API-Request ( ${fetchUrl} ):`, error);
                    });
            }
        });

        const flexElement = document.querySelector('sap-crm-flex[slot="custom-actions"]');
        if (flexElement && !document.getElementById("downloadAllErrorsButton")) {
            console.log("add button for downloading all errors...");
            const button = document.createElement("button");
            button.textContent = "Alle Fehler herunterladen (das kann einige Minuten dauern)";
            button.id = "downloadAllErrorsButton";
            button.style.cssText =
                "background-color: #fae5e5; color: #5a0404; font-weight: bold; border: 2px solid #5a0404; padding: 4px; border-radius: 5px; margin-right: 4px;";
            button.addEventListener("click", downloadAllErrorMessages);
            flexElement.insertBefore(button, flexElement.firstChild);
        }
    }
};

const processSubMessageTable = () => {
    const table = document.querySelector("crm-monitoring-message-requests")?.shadowRoot?.querySelector("sap-crm-table");

    if (table) {
        const messageId = document
            ?.querySelector("crm-monitoring-message-requests")
            ?.shadowRoot?.querySelector("sap-crm-value")
            ?.textContent?.trim();

        const rows = table.querySelectorAll("sap-crm-table-row");

        rows.forEach((row) => {
            const subMessageId = row
                ?.querySelector("sap-crm-table-cell:nth-child(1)")
                ?.querySelector("sap-crm-label")
                ?.textContent?.trim();
            const statusElement = row
                ?.querySelector("sap-crm-table-cell:nth-child(2)")
                ?.querySelector("sap-crm-tag")
                ?.shadowRoot?.querySelector("span");

            //console.log('subMessageId:', subMessageId, '-', statusElement?.textContent.trim());

            if (["Fehler", "ERROR"].includes(statusElement?.textContent?.trim()) && messageId && subMessageId) {
                const fetchUrl = `https://${window.location.host}/sap/c4c/api/v1/inbound-data-connector-service/messages/${messageId}/requests/${subMessageId}`;
                fetch(fetchUrl)
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error(`HTTP-Fehler: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then((data) => {
                        const errorDetails =
                            data?.value?.error?.details?.[0]?.details?.map((d) => d.message)?.join(" | ") ||
                            data?.value?.error?.details?.[0]?.message ||
                            data?.value?.error?.message ||
                            "Fehlerdetails nicht verfügbar";

                        //console.log("Error messages:", errorDetails);

                        statusElement.textContent = errorDetails;
                        row.querySelector("sap-crm-tag")
                            ?.shadowRoot?.querySelector("div")
                            ?.style.setProperty("max-width", "unset", "important");
                        row.querySelector("sap-crm-tag")
                            ?.shadowRoot?.querySelector("div")
                            ?.style.setProperty("text-transform", "unset", "important");
                    })
                    .catch((error) => {
                        console.error(`Fehler beim API-Request ( ${fetchUrl} ):`, error);
                    });
            }
        });
        rows.forEach((row) => {
            const subMessageId = row
                ?.querySelector("sap-crm-table-cell:nth-child(1)")
                ?.querySelector("sap-crm-label")
                ?.textContent?.trim();
            const statusElement = row
                ?.querySelector("sap-crm-table-cell:nth-child(2)")
                ?.querySelector("sap-crm-tag")
                ?.shadowRoot?.querySelector("span");

            //console.log('subMessageId:', subMessageId, '-', statusElement?.textContent.trim());

            if (["Fehler", "ERROR"].includes(statusElement?.textContent?.trim()) && messageId && subMessageId) {
                const fetchUrl = `https://${window.location.host}/sap/c4c/api/v1/outbound-data-connector-service/messages/${messageId}/requests/${subMessageId}`;
                fetch(fetchUrl)
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error(`HTTP-Fehler: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then((data) => {
                        const errorDetails =
                            data?.value?.error?.details?.[0]?.details?.map((d) => d.message)?.join(" | ") ||
                            data?.value?.error?.details?.[0]?.message ||
                            data?.value?.error?.message ||
                            "Fehlerdetails nicht verfügbar";

                        //console.log("Error messages:", errorDetails);

                        statusElement.textContent = errorDetails;
                        row.querySelector("sap-crm-tag")
                            ?.shadowRoot?.querySelector("div")
                            ?.style.setProperty("max-width", "unset", "important");
                        row.querySelector("sap-crm-tag")
                            ?.shadowRoot?.querySelector("div")
                            ?.style.setProperty("text-transform", "unset", "important");
                    })
                    .catch((error) => {
                        console.error(`Fehler beim API-Request ( ${fetchUrl} ):`, error);
                    });
            }
        });
    }
};

// debounce to avoid multiple executions
let debounceTimeout;

const debounceProcess = () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        processMessageTable();
        processSubMessageTable();
    }, 1000);
};

const observer = new MutationObserver(debounceProcess);

observer.observe(document.body, {
    childList: true,
    subtree: true
});
