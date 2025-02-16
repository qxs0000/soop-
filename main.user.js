// ==UserScript==
// @name         SOOP 방송 알림
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  사용자가 등록한 아프리카TV 방송인의 방송 상태를 확인하여 알림을 제공합니다.
// @author       qxs
// @downloadURL  https://github.com/qxs0000/sooplive-alart/raw/refs/heads/main/main.user.js
// @@updateURL   https://github.com/qxs0000/sooplive-alart/raw/refs/heads/main/main.user.js
// @match        play.sooplive.co.kr/*
// @match        www.sooplive.co.kr/*
// @match        vod.sooplive.co.kr/*
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      live.afreecatv.com
// ==/UserScript==

(async function() {
    'use strict';
    async function ensureNotificationPermission() {
        const hasRequested = await GM.getValue("hasRequestedNotificationPermission", false);
        if (hasRequested) return;
        Notification.requestPermission().then((permission) => {
            GM.setValue("hasRequestedNotificationPermission", true);
            console.log("Notification permission:", permission);
        });
    }
    await ensureNotificationPermission();
    const BROADCASTER_LIST_KEY = 'broadcasterList';
    const ALERT_INTERVAL_KEY = 'alertInterval';
    let alertInterval = await GM.getValue(ALERT_INTERVAL_KEY, 300000);
    async function getBroadcasterList() {
        return await GM.getValue(BROADCASTER_LIST_KEY, []);
    }
    async function setBroadcasterList(list) {
        await GM.setValue(BROADCASTER_LIST_KEY, list);
    }
    async function addBroadcaster() {
        let broadcasterId = prompt("알림을 받을 아프리카TV 방송인의 ID (bid)를 입력하세요:");
        if (broadcasterId) {
            let list = await getBroadcasterList();
            if (!list.includes(broadcasterId)) {
                list.push(broadcasterId);
                await setBroadcasterList(list);
                alert(`방송인 "${broadcasterId}"이(가) 등록되었습니다.`);
            } else {
                alert("이미 등록된 방송인입니다.");
            }
        }
    }
    async function manageBroadcasters() {
        let list = await getBroadcasterList();
        if (list.length === 0) {
            alert("등록된 방송인이 없습니다.");
            return;
        }
        let message = "등록된 방송인 목록:\n" + list.join("\n") + "\n\n삭제할 방송인의 ID를 입력하거나, 취소를 누르세요:";
        let toRemove = prompt(message);
        if (toRemove) {
            const newList = list.filter(id => id !== toRemove);
            await setBroadcasterList(newList);
            alert(`방송인 "${toRemove}"의 등록이 해제되었습니다.`);
        }
    }
    GM_registerMenuCommand("알림 간격 수정", async () => {
        let currentMinutes = alertInterval / 60000;
        let newInterval = prompt("방송 체크 간격(분)을 입력하세요:", currentMinutes);
        if (newInterval) {
            newInterval = parseInt(newInterval, 10);
            if (!isNaN(newInterval) && newInterval > 0) {
                alertInterval = newInterval * 60000;
                GM.setValue(ALERT_INTERVAL_KEY, alertInterval);
                alert("방송 체크 간격이 " + newInterval + "분으로 변경되었습니다.");
                clearInterval(broadcastIntervalId);
                broadcastIntervalId = setInterval(checkBroadcasts, alertInterval);
            } else {
                alert("올바른 값을 입력하세요.");
            }
        }
    });
    GM_registerMenuCommand("방송인 추가", async () => { await addBroadcaster(); });
    GM_registerMenuCommand("등록된 방송인 관리", async () => { await manageBroadcasters(); });
    function showNotification(title, message) {
        GM_notification({
            title: title,
            text: message,
            timeout: 5000,
            onclick: () => { window.focus(); }
        });
    }
    function fetchAfreecaLive(afreecaId) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: "POST",
                url: "https://live.afreecatv.com/afreeca/player_live_api.php",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                data: "bid=" + encodeURIComponent(afreecaId),
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const chan = data.CHANNEL;
                        if (!chan) {
                            return reject("No channel for " + afreecaId);
                        }
                        if (chan.RESULT === 1) {
                            resolve({
                                online: true,
                                title: chan.TITLE || '',
                                category: chan.CATE || '',
                                broadNo: chan.BNO || ''
                            });
                        } else {
                            resolve({ online: false });
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function(err) {
                    reject(err);
                }
            });
        });
    }
    const broadcastState = {};
    async function checkBroadcasts() {
        let broadcasterList = await getBroadcasterList();
        if (!broadcasterList || broadcasterList.length === 0) {
            console.log("등록된 방송인이 없습니다.");
            return;
        }
        const now = Date.now();
        const minInterval = 300000;
        broadcasterList.forEach(async (broadcasterId) => {
            try {
                const info = await fetchAfreecaLive(broadcasterId);
                if (info.online) {
                    if (!broadcastState[broadcasterId] || broadcastState[broadcasterId] === false) {
                        broadcastState[broadcasterId] = true;
                        const notifTitle = `방송 알림: ${broadcasterId}`;
                        const notifMessage = `${broadcasterId}님이 방송 중입니다!\n제목: ${info.title}`;
                        showNotification(notifTitle, notifMessage);
                    }
                } else {
                    broadcastState[broadcasterId] = false;
                    console.log(`[${broadcasterId}] 방송 오프라인`);
                }
            } catch (error) {
                console.error(`방송인 ${broadcasterId} 정보 가져오기 실패:`, error);
            }
        });
    }
    let broadcastIntervalId = setInterval(checkBroadcasts, alertInterval);
    checkBroadcasts();
})();

