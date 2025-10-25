// health-advisor-api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('Health Advisor API Key loaded:', process.env.GOOGLE_API_KEY ? '✅' : '❌');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// 🔥 2025年最新模型配置（更新！）
const freeModelPriority = [
  'gemini-2.5-flash',      // 最新最快
  'gemini-2.0-flash',      // 2025年1月版本
  'gemini-2.5-pro',        // 最強但較慢
  'gemini-2.0-flash-lite'  // 輕量備用
];

let cachedModel = null;
let cachedModelName = null;
let requestCount = 0;
let lastResetTime = Date.now();

// Reset request counter
function resetRequestCounter() {
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    requestCount = 0;
    lastResetTime = now;
  }
}

// Format health advice response
function formatHealthAdvice(text) {
  return text
    .replace(/\*\*\*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '• ')
    .replace(/\n\n\n+/g, '\n\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
}

// Create health analysis prompt (ENGLISH VERSION)
function createHealthAnalysisPrompt({
  bristolType,
  colorAnalysis,
  volumeAnalysis,
  userProfile,
  previousRecords
}) {
  const healthScore = calculateHealthScore(bristolType, colorAnalysis, volumeAnalysis);
  const trend = analyzeTrend(previousRecords, bristolType);
  const urgency = assessUrgency(bristolType, colorAnalysis);

  return `You are an expert digestive health AI consultant. Please provide personalized health recommendations in English.

📊 **Current Analysis Results**:
- Bristol Stool Scale Type: ${bristolType} ${getBristolDescription(bristolType)}
- Color Analysis: ${JSON.stringify(colorAnalysis, null, 2)}
- Volume Assessment: ${JSON.stringify(volumeAnalysis, null, 2)}
- Health Score: ${healthScore}/100
- Urgency Level: ${urgency}

${userProfile ? `
👤 **User Profile**:
- Age: ${userProfile.age || 'Unknown'}
- Gender: ${userProfile.gender || 'Unknown'}
- Diet Type: ${userProfile.diet || 'Regular'}
- Exercise Frequency: ${userProfile.exercise || 'Moderate'}
- Medical History: ${userProfile.conditions || 'None'}
- Allergies: ${userProfile.allergies || 'None'}
` : ''}

${trend ? `
📈 **Trend Analysis**:
- 7-Day Average: Type ${trend.average}
- Trend Direction: ${trend.direction}
- Change Rate: ${trend.changeRate}
- Priority: ${trend.priority}
` : ''}

⏱️ **Important**: Please complete your response within 30 seconds. Be concise but thorough.

Please provide comprehensive health advice in the following JSON structure:

{
  "healthStatus": {
    "level": "Choose: excellent/good/attention/warning/critical",
    "summary": "2-3 sentences summarizing current health status, be specific and personalized",
    "score": ${healthScore},
    "confidence": 0.85,
    "mainConcern": "Primary concern to address",
    "positiveAspects": "What's going well"
  },
  "dietaryAdvice": {
    "immediateActions": [
      "Immediate dietary adjustment 1 for today",
      "Immediate dietary adjustment 2 for today"
    ],
    "recommendations": [
      "Specific food recommendation (e.g., Add 2 tablespoons of oatmeal to breakfast)",
      "Specific food recommendation (e.g., Have a cup of yogurt after lunch)",
      "Specific food recommendation (e.g., Add 200g of dark leafy greens to dinner)"
    ],
    "avoidFoods": [
      "Specific foods to avoid and why",
      "Specific foods to avoid and why"
    ],
    "mealPlan": {
      "breakfast": "Breakfast suggestion with specific foods and portions",
      "lunch": "Lunch suggestion with specific foods and portions",
      "dinner": "Dinner suggestion with specific foods and portions",
      "snacks": "Snack suggestions if needed"
    },
    "waterIntake": "Specific water amount (ml) and timing",
    "supplements": [
      {"name": "Probiotics", "dosage": "10 billion CFU", "timing": "After breakfast", "reason": "Improve gut flora"}
    ]
  },
  "lifestyleAdvice": {
    "exercise": {
      "type": "Recommended exercise types (e.g., brisk walking, yoga)",
      "duration": "Duration per session",
      "frequency": "Weekly frequency",
      "bestTime": "Best time to exercise",
      "specific": "Specific movements (e.g., 5-minute clockwise abdominal massage)"
    },
    "toiletHabits": {
      "timing": "Best time for bowel movements",
      "position": "Recommended posture",
      "duration": "Recommended duration",
      "tips": "Specific techniques"
    },
    "stress": {
      "techniques": ["Specific stress reduction method 1", "Specific stress reduction method 2"],
      "dailyPractice": "Daily practice recommendations"
    },
    "sleep": {
      "duration": "Recommended sleep duration",
      "bedtime": "Recommended bedtime",
      "tips": "Specific methods to improve sleep quality"
    }
  },
  "warningSignals": [
    "Warning signals that need immediate attention",
    "Symptoms to monitor"
  ],
  "followUp": {
    "nextCheck": "Next check time (e.g., Tomorrow morning, In 3 days)",
    "frequency": "Recording frequency (e.g., Daily in the morning)",
    "expectations": {
      "shortTerm": "Expected improvements in 3 days",
      "mediumTerm": "Expected improvements in 1 week",
      "longTerm": "Expected improvements in 1 month"
    },
    "monitoringPoints": [
      "Key indicator to monitor 1",
      "Key indicator to monitor 2"
    ],
    "adjustmentTriggers": [
      "When to adjust the plan"
    ]
  },
  "personalizedTips": [
    "Very specific personalized tip 1",
    "Very specific personalized tip 2",
    "Very specific personalized tip 3"
  ],
  "motivationalMessage": "Personalized encouraging message",
  "urgencyLevel": "${urgency}",
  "doctorConsultation": {
    "needed": ${urgency === 'high' || bristolType === 1 || bristolType === 7},
    "reason": "Reason for medical consultation if needed",
    "specialty": "Recommended specialty (e.g., Gastroenterology, Family Medicine)",
    "preparation": "What to prepare before seeing doctor"
  },
  "naturalRemedies": [
    {
      "name": "Natural remedy name (e.g., Peppermint tea)",
      "method": "How to use",
      "frequency": "Frequency of use",
      "benefit": "Expected benefits"
    }
  ],
  "preventionStrategies": [
    "Long-term prevention strategy 1",
    "Long-term prevention strategy 2"
  ]
}

Important principles:
1. All recommendations must be specific, actionable, and personalized
2. Include specific amounts, times, and frequencies
3. Adjust tone based on severity (clear but not panic-inducing for serious cases)
4. Consider user's personal situation and historical trends
5. Provide immediately actionable items
6. Balance professionalism with understandability
7. Give positive encouragement while remaining realistic
8. **Complete within 30 seconds** to ensure timely response`;
}

// 🔥 改進的模型獲取函數（增加重試和詳細日誌）
async function getAvailableModel() {
  for (const modelName of freeModelPriority) {
    try {
      console.log(`🔍 Testing model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // 快速測試
      const testResult = await Promise.race([
        model.generateContent('test'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), 5000)
        )
      ]);
      
      const testResponse = await testResult.response;
      await testResponse.text();
      
      console.log(`✅ Model available: ${modelName}`);
      return { model, modelName };
    } catch (err) {
      console.log(`❌ Model ${modelName} unavailable: ${err.message}`);
      continue;
    }
  }
  throw new Error('❌ No available models found');
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Health Advisor AI API is running!',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.5.0',
    currentModel: cachedModelName || 'not initialized',
    features: [
      'Personalized Health Analysis',
      'AI-Powered Recommendations (Gemini 2.5)', 
      'Trend Analysis',
      'Multi-language Support',
      'Emergency Detection'
    ]
  });
});

// Main health advice endpoint
app.post('/api/health-advice', async (req, res) => {
  const { 
    bristolType, 
    colorAnalysis, 
    volumeAnalysis,
    userProfile,
    previousRecords
  } = req.body;

  // Validate required parameters
  if (!bristolType || bristolType < 1 || bristolType > 7) {
    return res.status(400).json({ 
      error: 'Please provide valid Bristol type (1-7)',
      success: false
    });
  }

  if (!process.env.GOOGLE_API_KEY) {
    return res.status(500).json({ 
      error: 'API Key not configured',
      success: false
    });
  }

  resetRequestCounter();
  
  // Check rate limit
  if (requestCount >= 10) {
    return res.status(429).json({ 
      error: 'Too many requests, please try again later',
      success: false,
      retryAfter: 60
    });
  }

  try {
    // Get or use cached model
    if (!cachedModel) {
      console.log('🔄 Initializing model...');
      const result = await getAvailableModel();
      cachedModel = result.model;
      cachedModelName = result.modelName;
    }
    
    console.log(`🤖 Using model: ${cachedModelName} for health advice`);
    requestCount++;

    // Create detailed health analysis prompt
    const healthPrompt = createHealthAnalysisPrompt({
      bristolType,
      colorAnalysis,
      volumeAnalysis,
      userProfile,
      previousRecords
    });

    console.log('🧠 Generating AI advice...');
    const startTime = Date.now();

    // 🔥 增加超時到 45 秒
    const result = await Promise.race([
      cachedModel.generateContent(healthPrompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI response timeout')), 45000)
      )
    ]);

    const response = await result.response;
    let adviceText = response.text();
    const responseTime = Date.now() - startTime;

    console.log(`✅ AI response completed in ${responseTime}ms`);

    // Parse JSON response
    let structuredAdvice;
    try {
      const jsonMatch = adviceText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        structuredAdvice = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Cannot extract JSON');
      }
    } catch (parseError) {
      console.log('⚠️ JSON parsing failed, using fallback');
      structuredAdvice = generateFallbackAdvice(
        bristolType, 
        colorAnalysis, 
        volumeAnalysis
      );
    }

    // Add metadata
    structuredAdvice.metadata = {
      generatedAt: new Date().toISOString(),
      model: cachedModelName,
      requestId: generateRequestId(),
      version: '2.5.0',
      responseTime: responseTime
    };

    res.json({
      success: true,
      advice: structuredAdvice,
      model: cachedModelName,
      timestamp: new Date().toISOString(),
      confidence: calculateConfidence(bristolType, colorAnalysis, volumeAnalysis),
      responseTime: responseTime
    });

  } catch (err) {
    console.error('❌ Health advice generation error:', err);
    
    // 清除失效的快取模型
    if (err.message.includes('timeout') || err.message.includes('404')) {
      console.log('🔄 Clearing cached model due to error');
      cachedModel = null;
      cachedModelName = null;
    }
    
    // Use fallback advice
    const fallbackAdvice = generateFallbackAdvice(
      bristolType, 
      colorAnalysis, 
      volumeAnalysis
    );

    res.json({
      success: true,
      advice: fallbackAdvice,
      model: 'fallback',
      timestamp: new Date().toISOString(),
      confidence: 0.7,
      note: 'Using fallback advice due to AI service issue'
    });
  }
});

// Quick advice endpoint
app.post('/api/quick-advice', async (req, res) => {
  const { bristolType } = req.body;

  if (!bristolType) {
    return res.status(400).json({ 
      error: 'Please provide Bristol type',
      success: false
    });
  }

  try {
    const quickAdvice = generateQuickAdvice(bristolType);
    
    res.json({
      success: true,
      advice: quickAdvice,
      type: 'quick',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Cannot generate quick advice'
    });
  }
});

// === Helper Functions ===

// Calculate health score
function calculateHealthScore(bristolType, colorAnalysis, volumeAnalysis) {
  let score = 100;
  
  // Bristol type scoring (40 points)
  const bristolScores = {
    1: -40, // Severe constipation
    2: -25, // Constipation
    3: -10, // Slightly dry
    4: 0,   // Ideal
    5: -10, // Slightly loose
    6: -25, // Diarrhea
    7: -40  // Severe diarrhea
  };
  score += bristolScores[bristolType] || -20;
  
  // Color scoring (30 points)
  if (colorAnalysis?.summary) {
    Object.values(colorAnalysis.summary).forEach(colorInfo => {
      const status = colorInfo.health_status || colorInfo.status;
      if (status === 'Warning' || status === 'Attention') {
        score -= 15;
      } else if (status === 'Alert' || status === 'Abnormal') {
        score -= 30;
      }
    });
  }
  
  // Volume scoring (20 points)
  if (volumeAnalysis?.overall_volume_class) {
    const volumeClass = volumeAnalysis.overall_volume_class.toLowerCase();
    if (volumeClass === 'small') {
      score -= 15;
    } else if (volumeClass === 'large') {
      score -= 10;
    }
  }
  
  return Math.max(0, Math.min(100, score));
}

// Analyze trend
function analyzeTrend(previousRecords, currentType) {
  if (!previousRecords || previousRecords.length === 0) {
    return null;
  }
  
  const recentRecords = previousRecords.slice(-7);
  const types = recentRecords.map(r => r.type || r.bristolType);
  const average = types.reduce((sum, t) => sum + t, 0) / types.length;
  
  let direction = 'Stable';
  let changeRate = 'No significant change';
  let priority = 'Maintain current approach';
  
  const firstHalf = types.slice(0, Math.floor(types.length / 2));
  const secondHalf = types.slice(Math.floor(types.length / 2));
  const firstAvg = firstHalf.reduce((sum, t) => sum + t, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, t) => sum + t, 0) / secondHalf.length;
  
  const change = secondAvg - firstAvg;
  if (Math.abs(change) < 0.5) {
    direction = 'Stable';
    changeRate = 'No significant change';
    priority = 'Continue current routine';
  } else if (change < 0 && secondAvg < 4) {
    direction = 'Improving';
    changeRate = `${Math.abs(change * 25).toFixed(0)}% improvement`;
    priority = 'Continue current plan';
  } else if (change > 0 && secondAvg > 4) {
    direction = 'Worsening';
    changeRate = `${Math.abs(change * 25).toFixed(0)}% decline`;
    priority = 'Adjust current plan';
  }
  
  return {
    average: average.toFixed(1),
    direction,
    changeRate,
    priority
  };
}

// Assess urgency
function assessUrgency(bristolType, colorAnalysis) {
  if (bristolType === 1 || bristolType === 7) {
    return 'high';
  }
  if (bristolType === 2 || bristolType === 6) {
    return 'medium';
  }
  
  if (colorAnalysis?.summary) {
    const hasAbnormalColor = Object.values(colorAnalysis.summary).some(info => {
      const status = info.health_status || info.status;
      return status === 'Alert' || status === 'Abnormal' || 
             info.color === 'Red' || info.color === 'Black';
    });
    
    if (hasAbnormalColor) {
      return 'high';
    }
  }
  
  return 'low';
}

// Bristol descriptions
function getBristolDescription(type) {
  const descriptions = {
    1: 'Separate hard lumps, like nuts (severe constipation)',
    2: 'Sausage-shaped but lumpy (constipation)',
    3: 'Like a sausage with cracks (slightly dry)',
    4: 'Like a sausage or snake, smooth and soft (ideal)',
    5: 'Soft blobs with clear edges (slightly loose)',
    6: 'Fluffy pieces with ragged edges (mild diarrhea)',
    7: 'Watery, no solid pieces (severe diarrhea)'
  };
  return descriptions[type] || 'Unknown type';
}

// Calculate confidence
function calculateConfidence(bristolType, colorAnalysis, volumeAnalysis) {
  let confidence = 0.5;
  
  if (bristolType >= 1 && bristolType <= 7) confidence += 0.2;
  if (colorAnalysis && Object.keys(colorAnalysis).length > 0) confidence += 0.15;
  if (volumeAnalysis && volumeAnalysis.overall_volume_class) confidence += 0.15;
  
  return Math.min(1, confidence);
}

// Generate request ID
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate fallback advice (English version)
function generateFallbackAdvice(bristolType, colorAnalysis, volumeAnalysis) {
  const healthScore = calculateHealthScore(bristolType, colorAnalysis, volumeAnalysis);
  const urgency = assessUrgency(bristolType, colorAnalysis);
  
  const adviceTemplates = {
    1: { // Severe constipation
      diet: ['Increase dietary fiber (whole grains, vegetables)', 'Drink 2000ml+ water daily', 'Add probiotics'],
      lifestyle: 'Walk 30 minutes daily, massage abdomen clockwise',
      warning: ['No bowel movement for 3+ days', 'Severe abdominal pain']
    },
    2: { // Constipation
      diet: ['Eat more high-fiber fruits and vegetables', 'Add oatmeal to breakfast', 'Have yogurt after meals'],
      lifestyle: 'Regular exercise, establish toilet routine',
      warning: ['Persistent difficulty', 'Blood in stool']
    },
    3: { // Slightly dry
      diet: ['Moderately increase fruit intake', 'Stay hydrated', 'Add olive oil'],
      lifestyle: 'Maintain exercise routine',
      warning: ['Monitor hydration']
    },
    4: { // Ideal
      diet: ['Maintain balanced diet', 'Continue current habits'],
      lifestyle: 'Keep up good habits',
      warning: []
    },
    5: { // Slightly loose
      diet: ['Reduce fatty foods', 'Avoid excessive fiber', 'Check food hygiene'],
      lifestyle: 'Regular schedule, manage stress',
      warning: ['Monitor if persistent']
    },
    6: { // Diarrhea
      diet: ['Avoid dairy temporarily', 'Bland diet', 'Replenish electrolytes'],
      lifestyle: 'Rest well, small frequent meals',
      warning: ['Dehydration signs', 'Fever']
    },
    7: { // Severe diarrhea
      diet: ['Immediate fluid and electrolyte replacement', 'Fast temporarily', 'BRAT diet'],
      lifestyle: 'Seek medical evaluation immediately',
      warning: ['Severe dehydration', 'Blood in stool', 'High fever']
    }
  };
  
  const template = adviceTemplates[bristolType] || adviceTemplates[4];
  
  return {
    healthStatus: {
      level: getHealthLevel(bristolType),
      summary: `Based on your results (Bristol Type ${bristolType}), ${getBristolDescription(bristolType)}`,
      score: healthScore,
      confidence: 0.7,
      mainConcern: getMainConcern(bristolType),
      positiveAspects: healthScore > 60 ? 'Digestive system functioning normally' : 'Taking steps toward better health'
    },
    dietaryAdvice: {
      immediateActions: template.diet.slice(0, 2),
      recommendations: template.diet,
      avoidFoods: getAvoidFoods(bristolType),
      mealPlan: {
        breakfast: getMealSuggestion(bristolType, 'breakfast'),
        lunch: getMealSuggestion(bristolType, 'lunch'),
        dinner: getMealSuggestion(bristolType, 'dinner'),
        snacks: getMealSuggestion(bristolType, 'snacks')
      },
      waterIntake: getWaterIntake(bristolType),
      supplements: getSupplements(bristolType)
    },
    lifestyleAdvice: {
      exercise: {
        type: getExerciseType(bristolType),
        duration: '30 minutes',
        frequency: '5 times per week',
        bestTime: 'Morning or 1 hour after meals',
        specific: template.lifestyle
      },
      toiletHabits: {
        timing: 'After waking or 30 minutes after meals',
        position: 'Elevate feet by 6 inches',
        duration: 'No more than 10 minutes',
        tips: "Don't strain, stay relaxed"
      },
      stress: {
        techniques: ['Deep breathing exercises', '10-minute meditation'],
        dailyPractice: 'Daily relaxation practice'
      },
      sleep: {
        duration: '7-8 hours',
        bedtime: 'Before 11 PM',
        tips: 'Avoid screens before bed'
      }
    },
    warningSignals: template.warning,
    followUp: {
      nextCheck: getNextCheckTime(bristolType),
      frequency: 'Daily recording',
      expectations: {
        shortTerm: 'Improved bowel frequency in 3 days',
        mediumTerm: 'Normal stool form in 1 week',
        longTerm: 'Regular bowel habits in 1 month'
      },
      monitoringPoints: ['Color changes', 'Shape changes', 'Frequency'],
      adjustmentTriggers: ['No improvement for 3 days', 'New symptoms appear']
    },
    personalizedTips: getPersonalizedTips(bristolType),
    motivationalMessage: getMotivationalMessage(bristolType, healthScore),
    urgencyLevel: urgency,
    doctorConsultation: {
      needed: urgency === 'high',
      reason: urgency === 'high' ? 'Symptoms require professional evaluation' : '',
      specialty: 'Gastroenterology',
      preparation: 'Document symptom frequency and food diary'
    },
    naturalRemedies: getNaturalRemedies(bristolType),
    preventionStrategies: getPreventionStrategies(bristolType)
  };
}

// Quick advice generation
function generateQuickAdvice(bristolType) {
  const quickTips = {
    1: 'Immediately increase water and fiber intake, consider probiotics',
    2: 'Eat more fruits and vegetables, increase exercise, establish regular toilet routine',
    3: 'Moderately increase hydration, maintain exercise',
    4: 'Excellent! Keep up your good habits',
    5: 'Watch food hygiene, avoid greasy foods',
    6: 'Replenish fluids and electrolytes, stick to bland diet temporarily',
    7: 'Immediately rehydrate, seek medical attention if needed'
  };
  
  return {
    quickTip: quickTips[bristolType],
    urgency: assessUrgency(bristolType, null),
    action: getImmediateAction(bristolType)
  };
}

// Get health level
function getHealthLevel(bristolType) {
  if (bristolType === 4) return 'excellent';
  if (bristolType === 3 || bristolType === 5) return 'good';
  if (bristolType === 2 || bristolType === 6) return 'attention';
  return 'warning';
}

// Get main concern
function getMainConcern(bristolType) {
  const concerns = {
    1: 'Severe constipation needs immediate improvement',
    2: 'Constipation requires dietary adjustment',
    3: 'Slightly dry, increase hydration',
    4: 'Ideal condition, maintain current routine',
    5: 'Slightly loose, watch food hygiene',
    6: 'Diarrhea needs management',
    7: 'Severe diarrhea requires medical attention'
  };
  return concerns[bristolType];
}

// Get foods to avoid
function getAvoidFoods(bristolType) {
  const avoidLists = {
    1: ['Processed foods', 'White bread', 'Red meat'],
    2: ['High-fat foods', 'Excessive dairy', 'Refined starches'],
    3: ['Excessive coffee', 'Alcohol'],
    4: [],
    5: ['Spicy foods', 'Coffee'],
    6: ['Dairy products', 'High-fiber foods', 'Fried foods'],
    7: ['All solid foods (temporarily)', 'Dairy', 'Caffeine']
  };
  return avoidLists[bristolType] || [];
}

// Get meal suggestions
function getMealSuggestion(bristolType, mealType) {
  const suggestions = {
    breakfast: {
      1: 'Oatmeal with berries + yogurt',
      2: 'Whole wheat toast + avocado + boiled egg',
      3: 'Multigrain porridge + nuts',
      4: 'Balanced breakfast',
      5: 'Plain porridge + steamed egg',
      6: 'White toast + banana',
      7: 'Electrolyte drink + plain porridge (small amount)'
    },
    lunch: {
      1: 'Brown rice + plenty of vegetables + lean meat',
      2: 'Buckwheat noodles + seaweed soup',
      3: 'Whole grain rice + greens + fish',
      4: 'Balanced lunch',
      5: 'Clear soup noodles + blanched vegetables',
      6: 'White rice + steamed fish',
      7: 'Clear broth + white rice (small amount)'
    },
    dinner: {
      1: 'Sweet potato + plenty of green vegetables',
      2: 'Pumpkin soup + whole wheat bread',
      3: 'Vegetable soup + brown rice',
      4: 'Balanced dinner',
      5: 'Congee + stir-fried vegetables',
      6: 'Rice porridge + steamed egg',
      7: 'Avoid eating or small amount of clear soup'
    },
    snacks: {
      1: 'Apples, pears, dried figs',
      2: 'Yogurt, nuts',
      3: 'Fruits, nuts',
      4: 'Moderate healthy snacks',
      5: 'Crackers',
      6: 'White toast',
      7: 'Avoid temporarily'
    }
  };
  
  return suggestions[mealType]?.[bristolType] || 'Consult a nutritionist';
}

// Get water intake
function getWaterIntake(bristolType) {
  const intake = {
    1: '2500-3000ml, sip throughout the day',
    2: '2000-2500ml, prefer warm water',
    3: '2000ml, normal intake',
    4: '1500-2000ml, maintain current intake',
    5: '2000ml, avoid ice water',
    6: '2500ml, include electrolytes',
    7: '3000ml+, with electrolyte drinks'
  };
  return intake[bristolType] || '2000ml';
}

// Get supplements
function getSupplements(bristolType) {
  const supplementList = {
    1: [
      {name: 'Probiotics', dosage: '10 billion CFU', timing: 'After breakfast', reason: 'Improve gut flora'},
      {name: 'Magnesium', dosage: '200mg', timing: 'Before bed', reason: 'Help bowel movement'}
    ],
    2: [
      {name: 'Probiotics', dosage: '5 billion CFU', timing: 'After breakfast', reason: 'Balance gut'}
    ],
    3: [
      {name: 'Prebiotics', dosage: '5g', timing: 'Before meals', reason: 'Promote beneficial bacteria'}
    ],
    4: [],
    5: [
      {name: 'Digestive enzymes', dosage: '1 capsule', timing: 'Before meals', reason: 'Aid digestion'}
    ],
    6: [
      {name: 'Probiotics', dosage: '20 billion CFU', timing: 'Empty stomach', reason: 'Restore gut balance'},
      {name: 'Electrolyte powder', dosage: '1 packet', timing: 'As needed', reason: 'Replace lost electrolytes'}
    ],
    7: [
      {name: 'Oral rehydration solution', dosage: '250ml', timing: 'Every 2 hours', reason: 'Prevent dehydration'}
    ]
  };
  return supplementList[bristolType] || [];
}

// Get exercise type
function getExerciseType(bristolType) {
  const exercises = {
    1: 'Brisk walking, swimming, yoga (twisting poses)',
    2: 'Jogging, cycling, core exercises',
    3: 'General aerobic exercise',
    4: 'Maintain current exercise',
    5: 'Light yoga, walking',
    6: 'Pause intense exercise, light stretching',
    7: 'Complete rest'
  };
  return exercises[bristolType];
}

// Get next check time
function getNextCheckTime(bristolType) {
  if (bristolType === 1 || bristolType === 7) return 'Tomorrow morning';
  if (bristolType === 2 || bristolType === 6) return 'In 2 days';
  if (bristolType === 3 || bristolType === 5) return 'In 3 days';
  return 'In 1 week';
}

// Get personalized tips
function getPersonalizedTips(bristolType) {
  const tips = {
    1: [
      'Drink warm water with lemon first thing in the morning',
      'Take a 15-minute walk after meals to promote bowel movement',
      'Do 5-minute abdominal massage before bed'
    ],
    2: [
      'Establish fixed toilet times to build habits',
      'Add fermented foods like kimchi or miso',
      "Don't delay when you feel the urge"
    ],
    3: [
      'Drink a glass of water before meals',
      'Increase olive oil intake',
      'Maintain exercise routine'
    ],
    4: [
      'Continue your excellent habits',
      'Keep tracking for consistency',
      'Share your success with others'
    ],
    5: [
      'Pay attention to food storage and hygiene',
      'Reduce eating out frequency',
      'Chew food thoroughly'
    ],
    6: [
      'Follow BRAT diet temporarily',
      'Avoid caffeine and alcohol',
      'Eat small frequent meals'
    ],
    7: [
      'Seek medical evaluation immediately',
      'Document symptom changes',
      'Prepare medical history'
    ]
  };
  return tips[bristolType] || ['Monitor changes', 'Track patterns', 'Adjust as needed'];
}

// Get motivational message
function getMotivationalMessage(bristolType, healthScore) {
  if (healthScore > 80) {
    return "Excellent! Your digestive health is in great shape. Keep it up! 🌟";
  } else if (healthScore > 60) {
    return "You're doing well! Just a few adjustments will get you to optimal health. You've got this! 💪";
  } else if (healthScore > 40) {
    return "Don't worry, following these recommendations will lead to improvement soon. Stay positive! 🌈";
  } else {
    return "Your health needs attention, but remember - it's never too late to start improving. We're here to help! ❤️";
  }
}

// Get immediate action
function getImmediateAction(bristolType) {
  const actions = {
    1: 'Drink 500ml warm water immediately, perform abdominal massage',
    2: 'Increase vegetable intake today',
    3: 'Hydrate now',
    4: 'Maintain current routine',
    5: 'Check food hygiene',
    6: 'Replenish electrolytes, rest',
    7: 'Seek medical help immediately'
  };
  return actions[bristolType];
}

// Get natural remedies
function getNaturalRemedies(bristolType) {
  const remedies = {
    1: [
      {name: 'Flaxseed powder', method: 'Mix with warm water', frequency: 'Every morning', benefit: 'Natural laxative'},
      {name: 'Aloe vera juice', method: '30ml before meals', frequency: 'Twice daily', benefit: 'Promotes bowel movement'}
    ],
    2: [
      {name: 'Prune juice', method: 'Drink 100ml before bed', frequency: 'Daily', benefit: 'Natural constipation relief'}
    ],
    3: [
      {name: 'Honey water', method: 'Warm water with honey', frequency: 'Morning on empty stomach', benefit: 'Moistens intestines'}
    ],
    4: [],
    5: [
      {name: 'Peppermint tea', method: 'Drink after meals', frequency: 'After each meal', benefit: 'Aids digestion'}
    ],
    6: [
      {name: 'Rice water', method: 'Sip frequently', frequency: 'Every 2 hours', benefit: 'Provides nutrients and stops diarrhea'}
    ],
    7: [
      {name: 'Oral rehydration salts', method: 'Follow package instructions', frequency: 'Continuous', benefit: 'Prevents dehydration'}
    ]
  };
  return remedies[bristolType] || [];
}

// Get prevention strategies
function getPreventionStrategies(bristolType) {
  if (bristolType <= 3) {
    return [
      'Establish regular meal times',
      'Consume 25-30g dietary fiber daily',
      'Develop consistent toilet habits'
    ];
  } else if (bristolType >= 5) {
    return [
      'Practice food safety and hygiene',
      'Avoid overeating',
      'Manage stress levels'
    ];
  }
  return [
    'Maintain balanced diet',
    'Exercise regularly',
    'Get adequate sleep'
  ];
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Server error occurred',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'POST /api/health-advice',
      'POST /api/quick-advice'
    ],
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log(`🚀 Health Advisor AI API v2.5.0`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Models: Gemini 2.5 Flash (primary)`);
  console.log(`📊 Health advice: http://localhost:${PORT}/api/health-advice`);
  console.log(`⚡ Quick advice: http://localhost:${PORT}/api/quick-advice`);
  console.log(`💚 Health check: http://localhost:${PORT}/`);
  console.log(`🌍 English version ready!`);
  console.log('========================================\n');
});
