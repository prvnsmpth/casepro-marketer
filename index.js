const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const { Configuration, OpenAIApi } = require('openai');

const sleep = (ms) => new Promise((res, rej) => setTimeout(res, ms));

// File to save cookies and local storage data
const SESSION_FILE_PATH = path.resolve(__dirname, 'session.json');

// Function to save cookies and local storage
async function saveSession(page) {
    const cookies = await page.cookies();
    const localStorage = await page.evaluate(() => {
        let store = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            store[key] = localStorage.getItem(key);
        }
        return store;
    });
    const sessionData = { cookies, localStorage };
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData));
    console.log('Session data saved.');
}

// Function to load cookies and local storage
async function loadSession(page) {
    if (fs.existsSync(SESSION_FILE_PATH)) {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
        if (sessionData.cookies) {
            await page.setCookie(...sessionData.cookies);
        }
        // if (sessionData.localStorage) {
        //     await page.evaluate((localStorageData) => {
        //         Object.keys(localStorageData).forEach(key => {
        //             localStorage.setItem(key, localStorageData[key]);
        //         });
        //     }, sessionData.localStorage);
        // }
        console.log('Session data loaded.');
        return true
    }
    return false
}

// Function to generate content using OpenAI API
async function generateContent(prompt, model = 'gpt-4') {
    // Load the API key from environment variables
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error("Please set the OPENAI_API_KEY environment variable.");
    }

    // Initialize OpenAI API client
    const configuration = new Configuration({
        apiKey: apiKey,
    });
    const openai = new OpenAIApi(configuration);

    try {
        // Make a call to the OpenAI API
        const response = await openai.createChatCompletion({
            model: model,
            messages: [
                { role: 'system', content: 'Please generate an interesting LinkedIn post based on the provided prompt.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 500, // Adjust token limit as needed
            temperature: 0.7, // Adjust for creativity (0 = deterministic, 1 = most random)
        });

        // Extract and return the generated content
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error generating content:', error.message);
        throw error;
    }
}

async function startPost(page) {
    const leftBound = 469.5
    const topBound = 88
    const width = 467
    const height = 48

    const xCoords = leftBound + width / 2;
    const yCoords = topBound + height / 2;

    await page.mouse.move(xCoords, yCoords);
    await page.mouse.click(xCoords, yCoords);
}

async function typePost(page, post) {
}

(async () => {
    // Load email and password from environment variables
    const { LI_EMAIL, LI_PASSWORD } = process.env;

    if (!LI_EMAIL || !LI_PASSWORD) {
        console.error("Please set the LINKEDIN_EMAIL and LINKEDIN_PASSWORD environment variables.");
        process.exit(1);
    }

    // Define the path to the Chrome browser executable
    const chromePath = '/usr/bin/google-chrome'; // Adjust the path to Chrome if necessary

    try {
        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: false, // Set to true if you want to run in headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        const loggedIn = await loadSession(page)

        if (!loggedIn) {
            // Open LinkedIn login page
            await page.goto('https://www.linkedin.com/login', {
                waitUntil: 'domcontentloaded',
            });

            // Type the email into the email input field
            await page.type('#username', LI_EMAIL, { delay: 10 });

            // Type the password into the password input field
            await page.type('#password', LI_PASSWORD, { delay: 10 });

            // Click the "Sign in" button
            await page.click('button[type="submit"]');

            // Wait for navigation to complete after login
            await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
            console.log('Logged in to LinkedIn successfully!');

            await saveSession(page)
        } else {
            // Open LinkedIn feed
            await page.goto('https://www.linkedin.com/feed', {
                waitUntil: 'domcontentloaded'
            })
        }

        await startPost(page)
        await page.waitForSelector('div.ql-editor[contenteditable="true"]')
        await sleep(2000)

        // Write the post
        const post = await generateContent("Write a short LinkedIn post about the importance of preparing for ")
        await page.keyboard.type("Hello! This is a draft post")
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();
