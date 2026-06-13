const fs = require('fs').promises;
const path = require('path');

// 你的設定值，建議以後可以在 GitHub Secrets 設定
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const DATA_FILE = path.join(__dirname, 'data.json');

async function getLivePriceFromYahoo(stockId) {
    if (!stockId) return "---";
    const id = String(stockId).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim();
    if (!id) return "---";
    
    try {
        const url = isNaN(id) ? `https://query1.finance.yahoo.com/v8/finance/chart/${id}` : `https://query1.finance.yahoo.com/v8/finance/chart/${id}.TW`;
        const response = await fetch(url);
        const json = await response.json();
        
        if (json && json.chart && json.chart.result && json.chart.result[0]) {
            const price = json.chart.result[0].meta.regularMarketPrice;
            return price ? price.toFixed(2) : "---"; 
        }
        return "---";
    } catch (e) {
        console.error("Yahoo API 撈取失敗: ", e);
        return "---";
    }
}

async function generateDailyStockStory() {
    if (!GEMINI_API_KEY) {
        console.error('找不到 GEMINI_API_KEY，請確認環境變數');
        process.exit(1);
    }

    // 1. 讀取現有資料
    let db = [];
    try {
        const fileData = await fs.readFile(DATA_FILE, 'utf8');
        db = JSON.parse(fileData);
    } catch (error) {
        console.log("找不到 data.json，將建立新檔案。");
    }

    // 2. 準備 Prompt (你原本精煉過的最強 Prompt)
    const pastStocksString = db.map(item => item.company_name).join(', ');
    const modelName = "gemini-2.0-flash";
    const prompt = `你是一個白話的股票秘書，輕鬆但不浮誇。請從台股與美股知名龍頭企業範圍內挑選。
【重要記憶庫】：歷史上你已經介紹過以下公司了：[${pastStocksString || '無'}]。
請遵循以下選股與寫作規則：
1. 優先挑選記憶庫裡沒有出現過的新公司。
2. 嚴禁陳腔濫調，講硬核的技術節點、供應鏈秘辛。
請嚴格按照以下 JSON 格式回傳，不要有任何多餘的字，也不要用 \`\`\`json 包裹：
{
  "stock_id": "代碼",
  "company_name": "名稱",
  "what_it_does": "直白解釋",
  "trend": "股價趨勢與表情",
  "why_hot": "為何是焦點",
  "trivia": "冷知識",
  "latest_news": "最新消息"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        console.log("正在呼叫 Gemini API...");
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const result = await response.json();
        let jsonText = result.candidates[0].content.parts[0].text;
        if (jsonText.includes("```")) {
            jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
        }
        
        const stockData = JSON.parse(jsonText);
        
        // 3. 抓取 Yahoo 股價
        console.log("正在抓取即時股價...");
        const realTimePrice = await getLivePriceFromYahoo(stockData.stock_id);
        
        // 4. 存檔入資料庫
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
        
        const newStory = {
            date: today,
            stock_id: stockData.stock_id,
            company_name: stockData.company_name,
            what_it_does: stockData.what_it_does,
            trend: stockData.trend,
            why_hot: stockData.why_hot,
            trivia: stockData.trivia,
            latest_news: stockData.latest_news,
            past_price: realTimePrice
        };

        db.push(newStory);
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
        console.log(`成功生成 ${stockData.company_name} 並寫入 data.json`);

    } catch (e) {
        console.error("發生錯誤: ", e);
        process.exit(1);
    }
}

generateDailyStockStory();
