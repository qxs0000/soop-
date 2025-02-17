// ==UserScript==
// @name         SOOP 방송 알림
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  사용자가 등록한 아프리카TV 스트리머의 방송 상태를 확인하여 알림을 제공합니다.
// @icon         https://res.sooplive.co.kr/afreeca.ico
// @author       qxs
// @downloadURL  https://github.com/qxs0000/sooplive-alart/raw/refs/heads/main/main.user.js
// @updateURL    https://github.com/qxs0000/sooplive-alart/raw/refs/heads/main/main.user.js
// @match        www.sooplive.co.kr/*
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      live.afreecatv.com
// ==/UserScript==

(async function() {
    'use strict';
    if (window.top !== window.self) return;

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
        let streamerID = prompt("알림을 받을 soop 스트리머의 ID를 입력하세요:");
        if (streamerID) {
            let list = await getBroadcasterList();
            if (!list.includes(streamerID)) {
                list.push(streamerID);
                await setBroadcasterList(list);
                alert(`스트리머 "${streamerID}"이(가) 등록되었습니다.`);
            } else {
                alert("이미 등록된 스트리머입니다.");
            }
        }
    }
    async function manageBroadcasters() {
        let list = await getBroadcasterList();
        if (list.length === 0) {
            alert("등록된 스트리머가 없습니다.");
            return;
        }
        let message = "등록된 스트리머 목록:\n" + list.join("\n") + "\n\n삭제할 스트리머의 ID를 입력하거나, 취소를 누르세요:";
        let toRemove = prompt(message);
        if (toRemove) {
            const newList = list.filter(id => id !== toRemove);
            await setBroadcasterList(newList);
            alert(`스트리머 "${toRemove}"의 등록이 해제되었습니다.`);
        }
    }
    GM_registerMenuCommand("방송 체크 간격 수정", async () => {
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
    GM_registerMenuCommand("스트리머 추가", async () => { await addBroadcaster(); });
    GM_registerMenuCommand("등록된 스트리머 관리", async () => { await manageBroadcasters(); });

    function showNotification(title, message) {
        const audio = new Audio('https://github.com/qxs0000/sooplive-alert/raw/refs/heads/main/sound/sound.mp3');
        audio.volume = 0.2;
        audio.play();
        GM_notification({
            title: title,
            text: message,
            timeout: 5000,
            onclick: () => { window.focus(); }
        });
    }
    function fetchAfreecaLive(soopID) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: "POST",
                url: "https://live.afreecatv.com/afreeca/player_live_api.php",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                data: "bid=" + encodeURIComponent(soopID),
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const chan = data.CHANNEL;
                        if (!chan) {
                            return reject("No channel for " + soopID);
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
    async function checkBroadcasts() {
        let streamerList = await getBroadcasterList();
        if (!streamerList || streamerList.length === 0) {
            console.log("등록된 스트리머가 없습니다.");
            return;
        }
        for (const streamerID of streamerList) {
            try {
                const info = await fetchAfreecaLive(streamerID);
                if (info.online) {
                    let lastNotified = await GM.getValue("lastNotified:" + streamerID, 0);
                    if (lastNotified === 0) {
                        await GM.setValue("lastNotified:" + streamerID, Date.now());
                        const notifTitle = `방송 알림: ${streamerID}`;
                        const notifMessage = `${streamerID}님이 방송 중입니다!\n제목: ${info.title}`;
                        showNotification(notifTitle, notifMessage);
                    }
                } else {
                    await GM.setValue("lastNotified:" + streamerID, 0);
                    console.log(`[${streamerID}] 방송 오프라인`);
                }
            } catch (error) {
                console.error(`스트리머 ${streamerID} 정보 가져오기 실패:`, error);
            }
        }
    }
    let broadcastIntervalId = setInterval(checkBroadcasts, alertInterval);
    checkBroadcasts();
})();
