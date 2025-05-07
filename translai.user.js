// ==UserScript==
// @name         TranslAI
// @namespace    https://github.com/Dautsuro/Userscripts
// @copyright    MIT
// @version      1.6.2
// @description  Translates Chinese web novel chapters on 69shuba into English using Gemini, with glossary support for name consistency; support for more sites may be added.
// @icon         https://www.google.com/s2/favicons?domain=69shuba.com
// @icon64       https://www.google.com/s2/favicons?domain=69shuba.com&sz=64
// @grant        GM_getValue
// @grant        GM_setValue
// @author       Dautsuro
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @require      https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js
// @match        https://www.69shuba.com/txt/*/*
// @connect      generativelanguage.googleapis.com
// @updateURL    https://raw.githubusercontent.com/Dautsuro/Userscripts/main/translai.user.js
// @downloadURL  https://raw.githubusercontent.com/Dautsuro/Userscripts/main/translai.user.js
// @supportURL   https://github.com/Dautsuro/Userscripts/issues
// ==/UserScript==

let apiKey = await GM_getValue('apiKey', null);

if (!apiKey) {
    apiKey = prompt('Enter your Gemini API key.');
    await GM_setValue('apiKey', apiKey);
}

let globalGlossary = await GM_getValue('globalGlossary', []);
const glossary = await GM_getValue('glossary', {});
const url = window.location.href;
const novelId = url.split('/')[4];

if (!glossary[novelId]) {
    glossary[novelId] = [];
}

$('.txtinfo').remove();
$('script').remove();

const chapterElem = $('.txtnav');
const titleElem = $('h1.hide720');

let title = titleElem.text().trim();
title = title.substring(title.indexOf('第'));
titleElem.text(title);

let chapter = chapterElem.text()
    .replace(new RegExp(title, 'g'), '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

chapter = [title, ...chapter].join('\n\n');
const rawChapter = chapter;
globalGlossary.sort((a, b) => b.chineseName.length - a.chineseName.length);
glossary[novelId].sort((a, b) => b.chineseName.length - a.chineseName.length);

for (const entry of globalGlossary) {
    chapter = chapter.replace(new RegExp(entry.chineseName, 'g'), entry.englishName);
}

for (const entry of glossary[novelId]) {
    chapter = chapter.replace(new RegExp(entry.chineseName, 'g'), entry.englishName);
}

let translatedChapter;

do {
    translatedChapter = await askGemini('You are a professional Chinese-to-English translator. Translate this Chinese novel chapter into English. Use established English renderings for names, terms, places, and techniques (from official sources, fan wikis, or widely accepted fan translations). Output only the translated chapter.', chapter);
} while (!translatedChapter);

glossary[novelId].sort((a, b) => a.englishName.length - b.englishName.length);

for (const entry of glossary[novelId]) {
    if (globalGlossary.find(globalEntry => globalEntry.chineseName === entry.chineseName)) {
        translatedChapter = translatedChapter.replace(new RegExp(entry.englishName, 'g'), match => {
            return `<span style="background-color: #d4edda; user-select: all;">${match}</span>`;
        });
    } else {
        translatedChapter = translatedChapter.replace(new RegExp(entry.englishName, 'g'), match => {
            return `<span style="background-color: #f8d7da; user-select: all;">${match}</span>`;
        });
    }
}

chapterElem.html(translatedChapter.replace(new RegExp('\n', 'g'), '<br>'));
let newGlossary;

do {
    newGlossary = await askGemini('You are a professional glossary creator. Search for any names, terms, places, and techniques available in the Chinese chapter and its translation in the English chapter. Create a JSON array using this format: [{"chineseName":"string", "englishName":"string"}, {"chineseName":"string", "englishName":"string"}]. Each value should strictly correspond to the name, do not add any note. Output only the JSON array.', `Chinese chapter:\n${rawChapter}\n\nEnglish chapter:\n${translatedChapter}`);
} while (!newGlossary);

if (newGlossary.includes('```')) {
    newGlossary = newGlossary.replace(/```json|```/g, '');
}

newGlossary = JSON.parse(newGlossary);

for (const newEntry of newGlossary) {
    if (!glossary[novelId].find(entry => entry.chineseName === newEntry.chineseName)) {
        glossary[novelId].push(newEntry);
    }
}

await GM_setValue('glossary', glossary);

const glossaryBtn = $('<button>', {
    text: '📝'
});

const addBtn = $('<button>', {
    text: '➕'
});

const removeBtn = $('<button>', {
    text: '➖'
});

glossaryBtn.css({
    position: 'fixed',
    top: '20px',
    right: '10px',
    padding: '8px',
    'font-size': '14px',
    'background-color': '#E0E8F0',
    color: 'white',
    border: 'none',
    'border-radius': '5px',
    cursor: 'pointer',
    'z-index': '9999',
    'box-shadow': '0 2px 5px rgba(0, 0, 0, 0.2)'
});

addBtn.css({
    position: 'fixed',
    top: '60px',
    right: '10px',
    padding: '8px',
    'font-size': '14px',
    'background-color': '#E0E8F0',
    color: 'white',
    border: 'none',
    'border-radius': '5px',
    cursor: 'pointer',
    'z-index': '9999',
    'box-shadow': '0 2px 5px rgba(0, 0, 0, 0.2)'
});

removeBtn.css({
    position: 'fixed',
    top: '100px',
    right: '10px',
    padding: '8px',
    'font-size': '14px',
    'background-color': '#E0E8F0',
    color: 'white',
    border: 'none',
    'border-radius': '5px',
    cursor: 'pointer',
    'z-index': '9999',
    'box-shadow': '0 2px 5px rgba(0, 0, 0, 0.2)'
});

glossaryBtn.on('click', async () => {
    const selectedText = window.getSelection().toString().trim();
    const entry = glossary[novelId].find(entry => entry.englishName.toLowerCase() === selectedText.toLowerCase());

    if (!entry) {
        alert('No entry found for this name.');
        return;
    }

    const oldName = entry.englishName;
    const newName = prompt(`Enter the new name. Previous name: ${entry.englishName}`);

    if (newName.length) {
        entry.englishName = newName;
        await GM_setValue('glossary', glossary);
        let chapter = chapterElem.html();
        chapter = chapter.replace(new RegExp(oldName, 'g'), newName);
        chapterElem.html(chapter);
    }
});

addBtn.on('click', async () => {
    const selectedText = window.getSelection().toString().trim();
    const entry = glossary[novelId].find(entry => entry.englishName.toLowerCase() === selectedText.toLowerCase());

    if (!entry) {
        alert('No entry found for this name.');
        return;
    }

    const globalEntry = globalGlossary.find(globalEntry => globalEntry.chineseName.toLowerCase() === entry.chineseName.toLowerCase());

    if (globalEntry) {
        alert('This name is already in the global glossary.');
        return;
    }

    globalGlossary.push(entry);
    await GM_setValue('globalGlossary', globalGlossary);
    let chapter = chapterElem.html();

    chapter = chapter.replace(new RegExp(`<span[ a-z="-:;]+>${selectedText}</span>`, 'g'), match => {
        return match.replace(new RegExp('background-color: .+?;'), 'background-color: #d4edda;');
    });

    chapterElem.html(chapter);
});

removeBtn.on('click', async () => {
    const selectedText = window.getSelection().toString().trim();
    const rmEntry = glossary[novelId].find(entry => entry.englishName.toLowerCase() === selectedText.toLowerCase());
    const rmGlobalEntry = globalGlossary.find(globalEntry => globalEntry.englishName.toLowerCase() === selectedText.toLowerCase());

    if (rmEntry) {
        glossary[novelId] = glossary[novelId].filter(entry => entry.chineseName !== rmEntry.chineseName);
    }

    if (rmGlobalEntry) {
        globalGlossary = globalGlossary.filter(entry => entry.chineseName !== rmGlobalEntry.chineseName);
    }

    await GM_setValue('glossary', glossary);
    await GM_setValue('globalGlossary', globalGlossary);
    let chapter = chapterElem.html();
    chapter = chapter.replace(new RegExp(`<span[ a-z="-:;]+>${selectedText}</span>`, 'g'), selectedText);
    chapterElem.html(chapter);
});

$('body').append(glossaryBtn);
$('body').append(addBtn);
$('body').append(removeBtn);

async function askGemini(instruction, content) {
    const systemInstruction = {
        parts: [
            { text: instruction }
        ]
    }

    const payload = {
        systemInstruction,
        contents: [
            {
                parts: [
                    { text: content }
                ]
            }
        ]
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.data.candidates[0].content.parts[0].text;
    } catch (err) {
        console.error(err);
        return null;
    }
}