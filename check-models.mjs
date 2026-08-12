// check-models.mjs
const apiKey = "YOUR_ACTUAL_AQ_API_KEY_HERE"; 

async function listMyModels() {
  console.log("Fetching allowed models from Google...");
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      console.error("API Error:", data.error.message);
      return;
    }

    console.log("\n✅ YOUR KEY HAS ACCESS TO THESE MODELS:\n");
    data.models.forEach(model => {
      // We only care about models that support text generation
      if (model.supportedGenerationMethods.includes("generateContent")) {
        // Strip the "models/" prefix so you can copy-paste it directly into your Next.js file
        console.log(`- ${model.name.replace('models/', '')}`);
      }
    });
    console.log("\nCopy one of the names above and paste it into your route.ts file!");
  } catch (err) {
    console.error("Failed to connect:", err);
  }
}

listMyModels();