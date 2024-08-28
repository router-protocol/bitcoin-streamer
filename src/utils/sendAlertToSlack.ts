import { SLACK_WEBHOOK_URL } from "../constant";

export default function sendAlertToSlack(message: string) {
    const payload = {
        text: message,
    };
    fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    })
        .then((response: any) => {
            if (!response.ok) {
                throw new Error(JSON.stringify(response));
            } else {
                console.log("Sent alert to slack!");
            }
        })
        .catch((error: any) => {
            console.error("Error sending alert to Slack:", error);
        });
}
