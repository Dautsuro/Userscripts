// ==UserScript==
// @name         TranslAI
// @namespace    https://github.com/Dautsuro/Userscripts
// @copyright    MIT
// @version      1.9.13
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

$('#pageheadermenu header').remove();
$('.txtinfo').remove();
$('script').remove();

const $chapter = $('.txtnav');
const $title = $('h1.hide720');

let title = $title.text().trim();
title = title.substring(title.indexOf('第'));
$title.text(title);

let chapter = $chapter.text()
    .replace(new RegExp(title, 'g'), '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

chapter = [title, ...chapter].join('\n\n');
const rawChapter = chapter;

const unifiedGlossary = [...globalGlossary, ...glossary[novelId]];
const sortedGlossary = unifiedGlossary.sort((a, b) => b.chineseName.length - a.chineseName.length);

let nameMap = {};

for (const entry of sortedGlossary) {
    nameMap[entry.chineseName] = entry.englishName;
}

const glossaryNames = sortedGlossary.map(entry => entry.chineseName);

chapter = chapter.replace(new RegExp(glossaryNames.join('|'), 'g'), match => {
    return nameMap[match];
});

let translatedChapter;

do {
    translatedChapter = await askGemini('You are a professional Chinese-to-English translator. Translate this Chinese novel chapter into English. Use established English renderings for names, terms, places, and techniques (from official sources, fan wikis, or widely accepted fan translations). Output only the translated chapter.', chapter);
} while (!translatedChapter);

let newGlossary;

do {
    newGlossary = await askGemini('You are a professional glossary creator. Search for any proper nouns (names, terms, places, and techniques) available in the Chinese chapter and its translation in the English chapter. Create a JSON array using this format: [{"chineseName":"string", "englishName":"string"}, {"chineseName":"string", "englishName":"string"}]. Each value should strictly correspond to the name, do not add any note. Output only the JSON array.', `Chinese chapter:\n${rawChapter}\n\nEnglish chapter:\n${translatedChapter}`);
} while (!newGlossary);

if (newGlossary.includes('```')) {
    newGlossary = newGlossary.replace(/```json|```/g, '');
}

newGlossary = JSON.parse(newGlossary);

for (const newEntry of newGlossary) {
    if (!glossary[novelId].find(entry => entry.chineseName.toLowerCase().trim() === newEntry.chineseName.toLowerCase().trim())) {
        glossary[novelId].push(newEntry);
    }
}

await GM_setValue('glossary', glossary);
nameMap = {};

for (const e of globalGlossary) {
    nameMap[e.englishName] = true;
}

for (const e of glossary[novelId]) {
    if (!(e.englishName in nameMap)) {
        nameMap[e.englishName] = false;
    }
}

const sortedNames = Object.keys(nameMap).sort((a, b) => b.length - a.length);
const escapedNames = sortedNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const combinedRegex = new RegExp(`\\b(${escapedNames.join('|')})\\b`, 'g');

translatedChapter = translatedChapter.replace(combinedRegex, match => {
    const isGlobal = nameMap[match];
    const bgColor = isGlobal ? '#d4edda' : '#f8d7da';
    return `<span style="background-color: ${bgColor}; user-select: all;">${match}</span>`;
});

$chapter.html(translatedChapter.replace(new RegExp('\n', 'g'), '<br>'));

const modifyButton = {
    text: '📝',
    onClick: async () => {
        const selectedText = window.getSelection().toString().trim();
        const entry = glossary[novelId].find(entry => entry.englishName.toLowerCase().trim() === selectedText.toLowerCase().trim());
        const globalEntry = globalGlossary.find(globalEntry => globalEntry.englishName.toLowerCase().trim() === selectedText.toLowerCase().trim());

        if (!entry && !globalEntry) {
            alert('No entry found for this name.');
            return;
        }

        const oldName = entry ? entry.englishName : globalEntry.englishName;
        const newName = prompt(`Enter the new name. Previous name: ${oldName}`);

        if (newName.length > 0) {
            if (entry) {
                entry.englishName = newName.trim();
                await GM_setValue('glossary', glossary);
            }

            if (globalEntry) {
                globalEntry.englishName = newName.trim();
                await GM_setValue('globalGlossary', globalGlossary);
            }
            
            let chapter = $chapter.html();
            chapter = chapter.replace(new RegExp(oldName, 'g'), newName);
            $chapter.html(chapter);
        }
    }
}

const addButton = {
    text: '➕',
    onClick: async () => {
        const selectedText = window.getSelection().toString().trim();
        const entry = glossary[novelId].find(entry => entry.englishName.toLowerCase().trim() === selectedText.toLowerCase().trim());

        if (!entry) {
            alert('No entry found for this name.');
            return;
        }

        const globalEntry = globalGlossary.find(globalEntry => globalEntry.chineseName.toLowerCase().trim() === entry.chineseName.toLowerCase().trim());

        if (globalEntry) {
            alert('This name is already in the global glossary.');
        } else {
            globalGlossary.push(entry);
            await GM_setValue('globalGlossary', globalGlossary);
        }

        let chapter = $chapter.html();

        chapter = chapter.replace(new RegExp(`<span[ a-z="-:;]+>${selectedText}</span>`, 'g'), match => {
            return match.replace(new RegExp('background-color: .+?;'), 'background-color: #d4edda;');
        });

        $chapter.html(chapter);
    }
}

const removeButton = {
    text: '➖',
    onClick: async () => {
        const selectedText = window.getSelection().toString().trim();
        const rmEntry = glossary[novelId].find(entry => entry.englishName.toLowerCase().trim() === selectedText.toLowerCase().trim());
        const rmGlobalEntry = globalGlossary.find(globalEntry => globalEntry.englishName.toLowerCase().trim() === selectedText.toLowerCase().trim());

        if (rmEntry) {
            glossary[novelId] = glossary[novelId].filter(entry => entry.chineseName !== rmEntry.chineseName);
        }

        if (rmGlobalEntry) {
            globalGlossary = globalGlossary.filter(entry => entry.chineseName !== rmGlobalEntry.chineseName);
        }

        await GM_setValue('glossary', glossary);
        await GM_setValue('globalGlossary', globalGlossary);
        let chapter = $chapter.html();
        chapter = chapter.replace(new RegExp(`<span[ a-z="-:;]+>${selectedText}</span>`, 'g'), selectedText);
        $chapter.html(chapter);
    }
}

addButtons([modifyButton, addButton, removeButton]);

function addButtons(buttons) {
    let positionIncrement = 0;

    for (const button of buttons) {
        const $button = $('<button>', {
            text: button.text
        });

        $button.css({
            position: 'fixed',
            top: `${10 + positionIncrement}px`,
            right: '5px',
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

        $button.on('click', button.onClick);
        $('body').append($button);
        positionIncrement += 40;
    }
}

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