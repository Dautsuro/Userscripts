// ==UserScript==
// @name         TranslAI
// @namespace    https://github.com/Dautsuro
// @version      1.0.0
// @description  -
// @author       Dautsuro
// @match        https://www.69shuba.com/txt/*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=69shuba.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.setClipboard
// ==/UserScript==

class Utils {
    static escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

class Novel {
    static get id() {
        const url = window.location.href;
        const urlSegments = url.split('/');
        return urlSegments[4];
    }
}

class NameManager {
    static get names() {
        return [...this.globalNames, ...this.localNames];
    }

    static async setup() {
        const local = await GM.getValue(Novel.id);
        const global = await GM.getValue('translatedNames');

        this.localNames = local ? JSON.parse(local) : [];
        this.globalNames = global ? JSON.parse(global) : [];
    }

    static async add(newName) {
        if (this.names.find(name => name.original === newName.original)) return;
        this.localNames.push(newName);
        await GM.setValue(Novel.id, JSON.stringify(this.localNames));
    }

    static isGlobal(name) {
        return this.globalNames.find(globalName => globalName.original === name.original) ? true : false;
    }

    static async addGlobal(originalName) {
        if (this.globalNames.find(name => name.original === originalName)) return;
        const name = this.localNames.find(name => name.original === originalName);
        this.globalNames.push(name);
        this.localNames = this.localNames.filter(localName => localName.original !== name.original);
        await GM.setValue('translatedNames', JSON.stringify(this.globalNames));
        await GM.setValue(Novel.id, JSON.stringify(this.localNames));
    }

    static async edit(originalName, newName) {
        const name = this.names.find(name => name.original === originalName);
        name.translated = newName;

        if (this.localNames.find(localName => localName.original === name.original)) {
            this.localNames = this.localNames.filter(localName => localName.original !== name.original);
            this.localNames.push(name);
            await GM.setValue(Novel.id, JSON.stringify(this.localNames));
        }

        if (this.globalNames.find(globalName => globalName.original === name.original)) {
            this.globalNames = this.globalNames.filter(globalName => globalName.original !== name.original);
            this.globalNames.push(name);
            await GM.setValue('translatedNames', JSON.stringify(this.globalNames));
        }
    }

    static async remove(originalName) {
        const name = this.names.find(name => name.original === originalName);
        this.localNames = this.localNames.filter(localName => localName.original !== name.original);
        this.globalNames = this.globalNames.filter(globalName => globalName.original !== name.original);
        await GM.setValue(Novel.id, JSON.stringify(this.localNames));
        await GM.setValue('translatedNames', JSON.stringify(this.globalNames));
    }
}

class Gemini {
    static async ask(instruction, input) {
        if (!this.apiKey) {
            this.apiKey = await GM.getValue('apiKey');

            if (!this.apiKey) {
                const apiKey = prompt('Enter your Gemini API key');
                if (!apiKey) return this.ask(instruction, input);
                this.apiKey = apiKey.trim();
                await GM.setValue('apiKey', this.apiKey);
            }
        }

        const systemInstruction = {
            parts: [{
                text: instruction
            }]
        }

        const payload = {
            systemInstruction,
            contents: [
                {
                    parts: [
                        { text: input }
                    ]
                }
            ]
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            return data['candidates'][0]['content']['parts'][0]['text'];
        } catch (error) {
            console.log(`Error while asking Gemini: ${error}`);
            throw error;
        }
    }
}

class Chapter {
    #title;
    #content;

    constructor(element) {
        this.element = element;
    }

    get title() {
        if (!this.#title) {
            this.#title = this.element.querySelector('h1.hide720')?.textContent;
        }

        return this.#title;
    }

    get content() {
        if (!this.#content) {
            this.element.querySelector('.txtinfo')?.remove();

            const escapedTitle = Utils.escapeRegExp(this.title);
            this.#content = this.element.innerText;
            this.#content = this.#content.replace(new RegExp(escapedTitle, 'g'), '');

            let lines = this.#content.split('\n');
            lines = lines.map(line => line.trim());
            lines = lines.filter(line => line.length > 0);

            this.#content = [this.title, ...lines].join('\n\n');
        }

        return this.#content;
    }

    async translate() {
        const instruction = 'You are a professional Chinese-to-English translator. Translate the provided Chinese novel chapter into English. Output only the translated chapter, no extra text';
        let modifiedContent = this.content;
        const names = NameManager.names.sort((a, b) => b.original.length - a.original.length);

        for (const name of names) {
            const escapedName = Utils.escapeRegExp(name.original);
            modifiedContent = modifiedContent.replace(new RegExp(escapedName, 'g'), name.translated);
        }

        this.translatedContent = await Gemini.ask(instruction, modifiedContent);
        await this.getNames();
        this.refreshDOM();
    }

    async getNames() {
        const instruction = 'You are a professional JSON extractor. Extract all proper nouns from the Chinese and English chapters. Create a JSON array where each entry follow this format: {"original":"Chinese name","translated":"English name"}';

        const input = `Chinese chapter:
        ${this.content}
        
        English chapter:
        ${this.translatedContent}`;

        const rawNames = await Gemini.ask(instruction, input);
        const names = JSON.parse(rawNames.replace(/```json|```/g, ''));
        
        for (const name of names) {
            await NameManager.add(name);
        }
    }

    refreshDOM() {
        let modifiedContent = this.translatedContent;
        const names = NameManager.names.sort((a, b) => b.translated.length - a.translated.length);

        for (const name of names) {
            const escapedName = Utils.escapeRegExp(name.translated);

            modifiedContent = modifiedContent.replace(new RegExp(escapedName, 'g'), match => {
                const color = NameManager.isGlobal(name) ? '#d4edda' : '#f8d7da';
                return `<span style="background-color: ${color}; user-select: all;" data-original="${name.original}">${match}</span>`;
            });
        }

        this.element.innerHTML = modifiedContent.replace(/\n/g, '<br>');
    }
}

class Button {
    static offset = 0;

    constructor(text) {
        this.text = text;
    }

    set onClick(callback) {
        this.element.addEventListener('click', callback);
    }

    render() {
        this.element = document.createElement('button');
        this.element.textContent = this.text;

        Object.assign(this.element.style, {
            position: 'fixed',
            bottom: `${5 + Button.offset}px`,
            right: '5px',
            'z-index': '1000',
            padding: '8px',
            'font-size': '14px',
            'background-color': '#E0E8F0',
        });

        Button.offset += 40;
        document.body.appendChild(this.element);
    }
}

(async () => {
    await NameManager.setup();

    const chapterElement = document.querySelector('.txtnav');
    const chapter = new Chapter(chapterElement);
    await chapter.translate();
    
    const editButton = new Button('📝');
    const addButton = new Button('➕');
    const removeButton = new Button('➖');
    const copyButton = new Button('📋');

    editButton.render();
    addButton.render();
    removeButton.render();
    copyButton.render();

    addButton.onClick = async () => {
        const selection = window.getSelection();
        let originalName = null;

        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            const fragment = range.cloneContents();
            const span = fragment.querySelector('span[data-original]');
            if (span) originalName = span.dataset.original;
        }

        if (!originalName) return;
        await NameManager.addGlobal(originalName);
        chapter.refreshDOM();
    };

    editButton.onClick = async () => {
        const selection = window.getSelection();
        let originalName = null;

        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            const fragment = range.cloneContents();
            const span = fragment.querySelector('span[data-original]');
            if (span) originalName = span.dataset.original;
        }

        if (!originalName) return;
        const newName = prompt('Enter new name');
        if (!newName) return;
        await NameManager.edit(originalName, newName);
        const escapedName = Utils.escapeRegExp(selection.toString());
        chapter.translatedContent = chapter.translatedContent.replace(new RegExp(escapedName, 'g'), newName);
        chapter.refreshDOM();
    }

    removeButton.onClick = async () => {
        const selection = window.getSelection();
        let originalName = null;

        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            const fragment = range.cloneContents();
            const span = fragment.querySelector('span[data-original]');
            if (span) originalName = span.dataset.original;
        }

        if (!originalName) return;
        await NameManager.remove(originalName);
        chapter.refreshDOM();
    }

    copyButton.onClick = async () => {
        const selection = window.getSelection();
        let originalName = null;

        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            const fragment = range.cloneContents();
            const span = fragment.querySelector('span[data-original]');
            if (span) originalName = span.dataset.original;
        }

        if (!originalName) return;
        await GM.setClipboard(originalName, 'text');
    }
})();
