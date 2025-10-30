// health-advisor-api/index.js - IMPROVED VERSION
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('Health Advisor API Key loaded:', process.env.GOOGLE_API_KEY ? '✅' : '❌');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// 🔥 2025年最新模型配置
const freeModelPriority = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash-lite'
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

// === NEW HELPER FUNCTIONS FOR PERSONALIZED ADVICE ===

// Extract color warnings from analysis
function extractColorWarnings(colorAnalysis) {
  const warnings = [];
  if (!colorAnalysis?.summary) return warnings;
  
  Object.entries(colorAnalysis.summary).forEach(([color, info]) => {
    const status = info.health_status || info.status;
    const percentage = info.percentage || 0;
    
    if (status === 'Warning' || status === 'Alert' || status === 'Abnormal') {
      warnings.push({
        color: color,
        status: status,
        percentage: percentage,
        description: info.description || `${color} color detected (${status})`,
        severity: status === 'Alert' || status === 'Abnormal' ? 'high' : 'medium'
      });
    } else if (color === 'Red' || color === 'Black') {
      warnings.push({
        color: color,
        status: 'Critical',
        percentage: percentage,
        description: `${color} detected - requires immediate medical attention`,
        severity: 'critical'
      });
    }
  });
  
  return warnings;
}

// Extract volume issues from analysis
function extractVolumeIssues(volumeAnalysis) {
  const issues = [];
  if (!volumeAnalysis) return issues;
  
  const volumeClass = volumeAnalysis.overall_volume_class?.toLowerCase();
  const volumeScore = volumeAnalysis.volume_score || 0;
  
  if (volumeClass === 'small') {
    issues.push({
      issue: 'Small volume',
      score: volumeScore,
      description: 'Volume is smaller than normal',
      implications: ['May indicate dehydration', 'Insufficient fiber intake', 'Incomplete evacuation'],
      severity: 'medium'
    });
  } else if (volumeClass === 'large') {
    issues.push({
      issue: 'Large volume',
      score: volumeScore,
      description: 'Volume is larger than normal',
      implications: ['Possible dietary excess', 'High fiber intake', 'Malabsorption concerns'],
      severity: 'medium'
    });
  }
  
  return issues;
}

// Generate specific concerns based on analysis
function generateSpecificConcerns(bristolType, colorAnalysis, volumeAnalysis) {
  const concerns = [];
  const colorWarnings = extractColorWarnings(colorAnalysis);
  const volumeIssues = extractVolumeIssues(volumeAnalysis);
  
  // Bristol type concerns
  if (bristolType === 1) {
    concerns.push('Severe constipation - stool is too hard and dry');
  } else if (bristolType === 2) {
    concerns.push('Constipation - stool formation indicates slow transit');
  } else if (bristolType === 6) {
    concerns.push('Loose stools - may indicate dietary issues or mild inflammation');
  } else if (bristolType === 7) {
    concerns.push('Watery diarrhea - potential infection or severe irritation');
  }
  
  // Color concerns
  colorWarnings.forEach(warning => {
    if (warning.severity === 'critical') {
      concerns.push(`URGENT: ${warning.description}`);
    } else if (warning.percentage > 30) {
      concerns.push(`${warning.color} coloration (${warning.percentage}%) - ${warning.description}`);
    }
  });
  
  // Volume concerns
  volumeIssues.forEach(issue => {
    concerns.push(`${issue.description} - ${issue.implications[0]}`);
  });
  
  return concerns;
}

// Create DETAILED health analysis prompt
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
  
  // 🔥 提取具體異常數據
  const colorWarnings = extractColorWarnings(colorAnalysis);
  const volumeIssues = extractVolumeIssues(volumeAnalysis);
  const specificConcerns = generateSpecificConcerns(bristolType, colorAnalysis, volumeAnalysis);

  return `You are an expert digestive health AI consultant. Provide HIGHLY PERSONALIZED and SPECIFIC health recommendations in English.

📊 **Current Analysis Results**:
- Bristol Stool Scale Type: ${bristolType} ${getBristolDescription(bristolType)}
- Health Score: ${healthScore}/100
- Urgency Level: ${urgency}

${colorWarnings.length > 0 ? `
🎨 **Color Analysis - CRITICAL FINDINGS**:
${colorWarnings.map(w => `  ⚠️ ${w.color} (${w.percentage}%) - ${w.status}
     Description: ${w.description}
     Severity: ${w.severity}`).join('\n')}
` : '🎨 **Color Analysis**: ✅ Normal color range detected'}

${volumeIssues.length > 0 ? `
📏 **Volume Analysis - SPECIFIC ISSUES**:
${volumeIssues.map(i => `  ⚠️ ${i.issue} (Score: ${i.score})
     ${i.description}
     Implications: ${i.implications.join(', ')}`).join('\n')}
` : '📏 **Volume Analysis**: ✅ Normal volume range'}

${specificConcerns.length > 0 ? `
🚨 **Specific Concerns Identified**:
${specificConcerns.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
` : ''}

${userProfile ? `
👤 **User Profile** (Use this for PERSONALIZATION):
- Age: ${userProfile.age || 'Unknown'}
- Gender: ${userProfile.gender || 'Unknown'}
- Diet Type: ${userProfile.diet || 'Regular'}
- Exercise Frequency: ${userProfile.exercise || 'Moderate'}
- Medical History: ${userProfile.conditions || 'None'}
- Allergies: ${userProfile.allergies || 'None'}
` : ''}

${trend ? `
📈 **7-Day Trend Analysis**:
- Average Type: ${trend.average}
- Trend Direction: ${trend.direction}
- Change Rate: ${trend.changeRate}
- Priority Action: ${trend.priority}
` : ''}

⚠️ **CRITICAL INSTRUCTIONS**:
1. You MUST address EVERY specific concern listed above
2. DO NOT give generic advice - reference the actual numbers and findings
3. If color warnings exist, explain what each color means for THIS user
4. If volume issues exist, explain the specific implications
5. Tailor advice to the user's age, diet type, and medical history
6. Make recommendations ACTIONABLE with specific amounts, times, and methods
7. Complete response within 30 seconds

Please provide comprehensive health advice in the following JSON structure:

{
  "healthStatus": {
    "level": "Choose: excellent/good/attention/warning/critical",
    "summary": "MUST reference the specific findings above (e.g., 'Your Type ${bristolType} stool with ${colorWarnings.length > 0 ? colorWarnings[0].color + ' coloration' : 'normal color'} indicates...')",
    "score": ${healthScore},
    "confidence": 0.85,
    "mainConcern": "THE MOST CRITICAL issue from the findings above",
    "positiveAspects": "What's actually going well based on the data"
  },
  "dietaryAdvice": {
    "immediateActions": [
      "Action specifically for ${colorWarnings.length > 0 ? colorWarnings[0].color + ' color issue' : 'Type ' + bristolType}",
      "Action specifically for ${volumeIssues.length > 0 ? volumeIssues[0].issue : 'current condition'}"
    ],
    "recommendations": [
      "Food recommendation targeting ${specificConcerns[0] || 'current type'} with specific amounts",
      "Food recommendation addressing ${colorWarnings.length > 0 ? 'color abnormality' : 'consistency'} with portions",
      "Food recommendation for ${volumeIssues.length > 0 ? 'volume normalization' : 'maintenance'}"
    ],
    "avoidFoods": [
      "Foods to avoid BECAUSE of ${specificConcerns[0] || 'current findings'}",
      "Foods that worsen ${colorWarnings.length > 0 ? colorWarnings[0].color + ' coloration' : 'Type ' + bristolType}"
    ],
    "mealPlan": {
      "breakfast": "Breakfast specifically for Type ${bristolType}${colorWarnings.length > 0 ? ' and ' + colorWarnings[0].color + ' color' : ''}",
      "lunch": "Lunch addressing ${volumeIssues.length > 0 ? volumeIssues[0].issue : 'current needs'}",
      "dinner": "Dinner targeting ${specificConcerns[0] || 'overall health'}",
      "snacks": "Snacks that help with ${bristolType <= 3 ? 'constipation' : 'loose stools'}"
    },
    "waterIntake": "Amount SPECIFIC to ${volumeIssues.length > 0 ? volumeIssues[0].issue : 'Type ' + bristolType} (not generic)",
    "supplements": [
      {"name": "Supplement for THIS condition", "dosage": "Specific amount", "timing": "Specific time", "reason": "Why THIS helps with ${specificConcerns[0] || 'current issue'}"}
    ]
  },
  "lifestyleAdvice": {
    "exercise": {
      "type": "Exercise SPECIFIC to ${bristolType <= 3 ? 'constipation relief' : 'digestive calming'}",
      "duration": "Duration based on severity",
      "frequency": "Frequency for THIS condition",
      "bestTime": "Best time for Type ${bristolType}",
      "specific": "Specific movements for ${specificConcerns[0] || 'current type'}"
    },
    "toiletHabits": {
      "timing": "Timing advice for Type ${bristolType}",
      "position": "Position that helps with ${bristolType <= 3 ? 'hard stools' : 'loose stools'}",
      "duration": "Duration appropriate for this type",
      "tips": "Techniques SPECIFIC to current findings"
    },
    "stress": {
      "techniques": ["Stress technique 1 for digestive health", "Technique 2 addressing ${specificConcerns[0] || 'current issues'}"],
      "dailyPractice": "Practice targeting THIS condition"
    },
    "sleep": {
      "duration": "Sleep duration for recovery from ${specificConcerns[0] || 'current state'}",
      "bedtime": "Bedtime for Type ${bristolType}",
      "tips": "Sleep tips that help with ${bristolType <= 3 ? 'constipation' : 'diarrhea'}"
    }
  },
  "warningSignals": [
    "Warning signal SPECIFIC to ${colorWarnings.length > 0 ? colorWarnings[0].color + ' color' : 'Type ' + bristolType}",
    "Symptom to watch based on current findings"
  ],
  "followUp": {
    "nextCheck": "When to check based on ${urgency} urgency",
    "frequency": "Recording frequency for THIS severity",
    "expectations": {
      "shortTerm": "Expected change in ${specificConcerns[0] || 'type'} in 3 days",
      "mediumTerm": "Expected improvement in ${colorWarnings.length > 0 ? 'color' : 'consistency'} in 1 week",
      "longTerm": "Long-term goal for THIS condition"
    },
    "monitoringPoints": [
      "Monitor ${colorWarnings.length > 0 ? colorWarnings[0].color + ' percentage changes' : 'consistency changes'}",
      "Track ${volumeIssues.length > 0 ? 'volume normalization' : 'frequency'}"
    ],
    "adjustmentTriggers": [
      "Adjust if ${specificConcerns[0] || 'condition'} worsens"
    ]
  },
  "personalizedTips": [
    "Tip #1: Specific to ${userProfile?.age ? userProfile.age + ' years old' : 'your age'} with Type ${bristolType}",
    "Tip #2: For ${userProfile?.diet || 'your'} diet addressing ${colorWarnings.length > 0 ? 'color issue' : 'current type'}",
    "Tip #3: Based on ${userProfile?.exercise || 'your exercise'} level and ${specificConcerns[0] || 'findings'}"
  ],
  "motivationalMessage": "Message acknowledging ${specificConcerns.length > 0 ? 'their specific challenges' : 'their progress'} and Type ${bristolType}",
  "urgencyLevel": "${urgency}",
  "doctorConsultation": {
    "needed": ${urgency === 'high' || colorWarnings.some(w => w.severity === 'critical')},
    "reason": "${colorWarnings.length > 0 ? 'Color abnormality requires professional evaluation' : urgency === 'high' ? 'Severity requires medical attention' : 'For monitoring purposes'}",
    "specialty": "${colorWarnings.some(w => w.color === 'Red' || w.color === 'Black') ? 'Gastroenterology - URGENT' : 'Family Medicine or Gastroenterology'}",
    "preparation": "Bring details about ${specificConcerns[0] || 'current symptoms'} and ${trend ? 'the 7-day trend data' : 'symptom duration'}"
  },
  "naturalRemedies": [
    {
      "name": "Remedy SPECIFIC for Type ${bristolType}",
      "method": "Method addressing ${specificConcerns[0] || 'current condition'}",
      "frequency": "Frequency for THIS severity",
      "benefit": "Why this helps with ${colorWarnings.length > 0 ? colorWarnings[0].color + ' color' : 'Type ' + bristolType}"
    }
  ],
  "preventionStrategies": [
    "Prevention strategy for ${specificConcerns[0] || 'Type ' + bristolType}",
    "Long-term plan addressing ${colorWarnings.length > 0 ? 'color issues' : volumeIssues.length > 0 ? 'volume concerns' : 'consistency'}"
  ]
}

REMEMBER: Every recommendation must reference the ACTUAL data provided. NO generic advice allowed!`;
}

// 🔥 改進的模型獲取函數
async function getAvailableModel() {
  for (const modelName of freeModelPriority) {
    try {
      console.log(`🔍 Testing model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
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
    version: '2.6.0-improved',
    currentModel: cachedModelName || 'not initialized',
    features: [
      'Personalized Health Analysis',
      'AI-Powered Recommendations (Gemini 2.5)', 
      'Trend Analysis',
      'Color & Volume Specific Advice',
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
    console.log(`📊 Bristol Type: ${bristolType}`);
    console.log(`🎨 Color warnings: ${extractColorWarnings(colorAnalysis).length}`);
    console.log(`📏 Volume issues: ${extractVolumeIssues(volumeAnalysis).length}`);
    
    requestCount++;

    // Create detailed health analysis prompt
    const healthPrompt = createHealthAnalysisPrompt({
      bristolType,
      colorAnalysis,
      volumeAnalysis,
      userProfile,
      previousRecords
    });

    console.log('🧠 Generating personalized AI advice...');
    const startTime = Date.now();

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
        console.log('✅ JSON parsed successfully');
      } else {
        throw new Error('Cannot extract JSON');
      }
    } catch (parseError) {
      console.log('⚠️ JSON parsing failed, using improved fallback');
      structuredAdvice = generateImprovedFallbackAdvice(
        bristolType, 
        colorAnalysis, 
        volumeAnalysis,
        userProfile
      );
    }

    // Add metadata
    structuredAdvice.metadata = {
      generatedAt: new Date().toISOString(),
      model: cachedModelName || 'fallback',
      requestId: generateRequestId(),
      version: '2.6.0',
      responseTime: responseTime,
      colorWarningsDetected: extractColorWarnings(colorAnalysis).length,
      volumeIssuesDetected: extractVolumeIssues(volumeAnalysis).length
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
    
    if (err.message.includes('timeout') || err.message.includes('404')) {
      console.log('🔄 Clearing cached model due to error');
      cachedModel = null;
      cachedModelName = null;
    }
    
    // Use improved fallback advice
    const fallbackAdvice = generateImprovedFallbackAdvice(
      bristolType, 
      colorAnalysis, 
      volumeAnalysis,
      userProfile
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
  
  const bristolScores = {
    1: -40, 2: -25, 3: -10, 4: 0, 5: -10, 6: -25, 7: -40
  };
  score += bristolScores[bristolType] || -20;
  
  // Enhanced color scoring
  const colorWarnings = extractColorWarnings(colorAnalysis);
  colorWarnings.forEach(warning => {
    if (warning.severity === 'critical') score -= 40;
    else if (warning.severity === 'high') score -= 25;
    else score -= 10;
  });
  
  // Enhanced volume scoring
  const volumeIssues = extractVolumeIssues(volumeAnalysis);
  volumeIssues.forEach(issue => {
    score -= 15;
  });
  
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
  const colorWarnings = extractColorWarnings(colorAnalysis);
  
  // Critical color warnings override everything
  if (colorWarnings.some(w => w.severity === 'critical')) {
    return 'high';
  }
  
  if (bristolType === 1 || bristolType === 7) {
    return 'high';
  }
  if (bristolType === 2 || bristolType === 6) {
    return 'medium';
  }
  
  if (colorWarnings.length > 0) {
    return 'medium';
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

// 🔥 IMPROVED FALLBACK ADVICE - Now personalized!
function generateImprovedFallbackAdvice(bristolType, colorAnalysis, volumeAnalysis, userProfile) {
  const healthScore = calculateHealthScore(bristolType, colorAnalysis, volumeAnalysis);
  const urgency = assessUrgency(bristolType, colorAnalysis);
  const colorWarnings = extractColorWarnings(colorAnalysis);
  const volumeIssues = extractVolumeIssues(volumeAnalysis);
  const specificConcerns = generateSpecificConcerns(bristolType, colorAnalysis, volumeAnalysis);
  
  // Build personalized summary
  let summary = `Based on your results (Bristol Type ${bristolType}), `;
  if (colorWarnings.length > 0) {
    summary += `with ${colorWarnings[0].color} coloration detected (${colorWarnings[0].percentage}%), `;
  }
  if (volumeIssues.length > 0) {
    summary += `and ${volumeIssues[0].issue.toLowerCase()} noted, `;
  }
  summary += getBristolDescription(bristolType);
  
  const adviceTemplates = {
    1: {
      diet: [
        'Increase dietary fiber to 30g daily (whole grains, vegetables)',
        'Drink 2500ml+ water throughout the day',
        'Add probiotics (10 billion CFU) after breakfast',
        ...(colorWarnings.length > 0 ? [`Address ${colorWarnings[0].color} color: ${getColorSpecificAdvice(colorWarnings[0].color)}`] : [])
      ],
      lifestyle: 'Walk 30 minutes daily, massage abdomen clockwise for 5 minutes',
      warning: [
        'No bowel movement for 3+ days',
        'Severe abdominal pain',
        ...(colorWarnings.map(w => w.description))
      ]
    },
    2: {
      diet: [
        'Eat more high-fiber fruits (prunes, pears) and vegetables',
        'Add 2 tablespoons oatmeal to breakfast',
        'Have 200ml yogurt after each meal',
        ...(volumeIssues.length > 0 ? [`For ${volumeIssues[0].issue}: ${volumeIssues[0].implications[0]}`] : [])
      ],
      lifestyle: 'Regular exercise 5x/week, establish morning toilet routine',
      warning: ['Persistent difficulty', 'Blood in stool']
    },
    3: {
      diet: [
        'Moderately increase fruit intake (2-3 servings daily)',
        'Maintain 2000ml water intake',
        'Add 1 tablespoon olive oil to salads'
      ],
      lifestyle: 'Maintain current exercise routine',
      warning: ['Monitor hydration levels']
    },
    4: {
      diet: ['Maintain balanced diet', 'Continue current habits'],
      lifestyle: 'Keep up excellent habits',
      warning: []
    },
    5: {
      diet: [
        'Reduce fatty foods temporarily',
        'Avoid excessive fiber',
        'Check food storage and hygiene',
        ...(colorWarnings.length > 0 ? [`Color concern: ${colorWarnings[0].description}`] : [])
      ],
      lifestyle: 'Regular schedule, manage stress',
      warning: ['Monitor if persistent beyond 2 days']
    },
    6: {
      diet: [
        'Avoid dairy products temporarily',
        'Follow BRAT diet (Bananas, Rice, Applesauce, Toast)',
        'Replenish electrolytes (oral rehydration solution)',
        ...(volumeIssues.length > 0 ? ['Small frequent meals to prevent dehydration'] : [])
      ],
      lifestyle: 'Rest well, eat small frequent meals',
      warning: ['Dehydration signs', 'Fever', ...(colorWarnings.map(w => w.description))]
    },
    7: {
      diet: [
        'Immediate fluid and electrolyte replacement (3000ml+)',
        'Fast temporarily (4-6 hours)',
        'Then introduce BRAT diet gradually',
        ...(colorWarnings.some(w => w.severity === 'critical') ? ['URGENT: Seek medical attention for color abnormality'] : [])
      ],
      lifestyle: 'Seek medical evaluation immediately',
      warning: ['Severe dehydration', 'Blood in stool', 'High fever', 'Dizziness']
    }
  };
  
  const template = adviceTemplates[bristolType] || adviceTemplates[4];
  
  // Personalize based on user profile
  let personalizedTips = [];
  if (userProfile) {
    if (userProfile.age) {
      personalizedTips.push(`For your age group (${userProfile.age}): ${getAgeSpecificTip(userProfile.age, bristolType)}`);
    }
    if (userProfile.diet) {
      personalizedTips.push(`Diet adjustment for ${userProfile.diet} diet: ${getDietSpecificTip(userProfile.diet, bristolType)}`);
    }
    if (userProfile.exercise) {
      personalizedTips.push(`Exercise modification for ${userProfile.exercise} activity level: ${getExerciseTip(userProfile.exercise, bristolType)}`);
    }
  }
  
  if (personalizedTips.length === 0) {
    personalizedTips = getPersonalizedTips(bristolType);
  }
  
  return {
    healthStatus: {
      level: getHealthLevel(bristolType),
      summary: summary,
      score: healthScore,
      confidence: 0.75,
      mainConcern: specificConcerns[0] || getMainConcern(bristolType),
      positiveAspects: healthScore > 60 ? 'Taking proactive steps toward better health' : 'Identified specific areas for improvement'
    },
    dietaryAdvice: {
      immediateActions: template.diet.slice(0, 2),
      recommendations: template.diet,
      avoidFoods: getAvoidFoods(bristolType, colorWarnings),
      mealPlan: {
        breakfast: getMealSuggestion(bristolType, 'breakfast'),
        lunch: getMealSuggestion(bristolType, 'lunch'),
        dinner: getMealSuggestion(bristolType, 'dinner'),
        snacks: getMealSuggestion(bristolType, 'snacks')
      },
      waterIntake: getWaterIntake(bristolType, volumeIssues),
      supplements: getSupplements(bristolType, colorWarnings)
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
        techniques: ['Deep breathing exercises (5 minutes)', '10-minute meditation'],
        dailyPractice: 'Daily relaxation practice before bed'
      },
      sleep: {
        duration: '7-8 hours',
        bedtime: 'Before 11 PM',
        tips: 'Avoid screens 1 hour before bed'
      }
    },
    warningSignals: template.warning,
    followUp: {
      nextCheck: getNextCheckTime(bristolType, urgency),
      frequency: 'Daily recording',
      expectations: {
        shortTerm: `Expect ${getShortTermExpectation(bristolType)} in 3 days`,
        mediumTerm: `Expect ${getMediumTermExpectation(bristolType, colorWarnings)} in 1 week`,
        longTerm: `Achieve ${getLongTermExpectation(bristolType)} in 1 month`
      },
      monitoringPoints: [
        ...(colorWarnings.length > 0 ? [`${colorWarnings[0].color} color percentage changes`] : ['Color changes']),
        'Stool consistency changes',
        'Frequency patterns'
      ],
      adjustmentTriggers: ['No improvement for 3 days', 'New symptoms appear', ...(colorWarnings.length > 0 ? ['Color intensifies'] : [])]
    },
    personalizedTips: personalizedTips,
    motivationalMessage: getMotivationalMessage(bristolType, healthScore, specificConcerns),
    urgencyLevel: urgency,
    doctorConsultation: {
      needed: urgency === 'high' || colorWarnings.some(w => w.severity === 'critical'),
      reason: colorWarnings.some(w => w.severity === 'critical') 
        ? `Critical color abnormality (${colorWarnings[0].color}) requires immediate professional evaluation`
        : urgency === 'high' 
          ? 'Symptoms require professional evaluation' 
          : '',
      specialty: colorWarnings.some(w => w.color === 'Red' || w.color === 'Black') 
        ? 'Gastroenterology - URGENT' 
        : 'Gastroenterology or Family Medicine',
      preparation: `Document: ${specificConcerns.join(', ')}, symptom frequency, and food diary`
    },
    naturalRemedies: getNaturalRemedies(bristolType, colorWarnings),
    preventionStrategies: getPreventionStrategies(bristolType, colorWarnings, volumeIssues)
  };
}

// New helper functions for personalization

function getColorSpecificAdvice(color) {
  const adviceMap = {
    'Red': 'Avoid iron supplements temporarily, increase hydration',
    'Black': 'Stop iron supplements, avoid activated charcoal',
    'Green': 'Reduce leafy greens temporarily, check for food poisoning',
    'Yellow': 'Reduce fat intake, check for malabsorption',
    'White': 'Check for bile duct issues, seek medical attention',
    'Brown': 'Normal - continue current diet'
  };
  return adviceMap[color] || 'Monitor color changes';
}

function getAgeSpecificTip(age, bristolType) {
  if (age < 30) {
    return bristolType <= 3 
      ? 'Young adults: Ensure adequate fiber (25-30g) and hydration during busy schedules'
      : 'Watch for stress-related digestive issues, maintain regular eating patterns';
  } else if (age < 50) {
    return bristolType <= 3
      ? 'Middle age: Consider magnesium supplements and increase exercise'
      : 'Monitor for food intolerances that develop with age';
  } else {
    return bristolType <= 3
      ? 'Seniors: Gentle fiber increase, stay active, consider stool softeners'
      : 'Check medications for side effects, maintain regular medical check-ups';
  }
}

function getDietSpecificTip(diet, bristolType) {
  const tipMap = {
    'Vegetarian': bristolType <= 3 
      ? 'Increase variety of fiber sources, add more legumes'
      : 'Ensure protein balance, consider digestive enzymes',
    'Vegan': bristolType <= 3
      ? 'Add more whole grains and flaxseeds'
      : 'Check B12 levels, ensure adequate protein',
    'Keto': bristolType <= 3
      ? 'Critical: Add non-starchy vegetables, increase water to 3L'
      : 'Consider reducing fat temporarily',
    'Regular': bristolType <= 3
      ? 'Increase whole grains and reduce processed foods'
      : 'Check for food sensitivities'
  };
  return tipMap[diet] || 'Maintain balanced diet';
}

function getExerciseTip(exerciseLevel, bristolType) {
  const tipMap = {
    'Sedentary': 'Start with 15-minute walks after meals',
    'Light': 'Increase to 30-minute sessions, add core exercises',
    'Moderate': 'Continue current routine, add yoga for digestion',
    'Active': bristolType <= 3 
      ? 'Maintain intensity, ensure adequate hydration'
      : 'Reduce intensity temporarily during digestive distress'
  };
  return tipMap[exerciseLevel] || 'Regular moderate exercise';
}

function getShortTermExpectation(bristolType) {
  if (bristolType <= 2) return 'softer consistency and easier passage';
  if (bristolType >= 6) return 'firmer consistency and reduced frequency';
  return 'consistency stabilization';
}

function getMediumTermExpectation(bristolType, colorWarnings) {
  let expectation = bristolType === 4 ? 'maintenance of optimal health' : 'return to Type 4 (ideal)';
  if (colorWarnings.length > 0) {
    expectation += ` and normalization of ${colorWarnings[0].color} coloration`;
  }
  return expectation;
}

function getLongTermExpectation(bristolType) {
  return 'regular, predictable bowel habits with Type 4 consistency';
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

// Get foods to avoid - now personalized
function getAvoidFoods(bristolType, colorWarnings = []) {
  const avoidLists = {
    1: ['Processed foods', 'White bread', 'Red meat', 'Cheese'],
    2: ['High-fat foods', 'Excessive dairy', 'Refined starches'],
    3: ['Excessive coffee', 'Alcohol'],
    4: [],
    5: ['Spicy foods', 'Coffee', 'Raw vegetables temporarily'],
    6: ['Dairy products', 'High-fiber foods', 'Fried foods', 'Caffeine'],
    7: ['All solid foods (temporarily)', 'Dairy', 'Caffeine', 'Alcohol']
  };
  
  let avoidList = avoidLists[bristolType] || [];
  
  // Add color-specific avoidances
  if (colorWarnings.some(w => w.color === 'Red')) {
    avoidList.push('Iron supplements (temporarily)');
  }
  if (colorWarnings.some(w => w.color === 'Black')) {
    avoidList.push('Iron supplements', 'Activated charcoal');
  }
  if (colorWarnings.some(w => w.color === 'Green')) {
    avoidList.push('Excessive leafy greens');
  }
  
  return avoidList;
}

// Get meal suggestions
function getMealSuggestion(bristolType, mealType) {
  const suggestions = {
    breakfast: {
      1: 'Oatmeal (1 cup) with berries + yogurt (200ml)',
      2: 'Whole wheat toast (2 slices) + avocado + boiled egg',
      3: 'Multigrain porridge + nuts (30g)',
      4: 'Balanced breakfast of choice',
      5: 'Plain porridge + steamed egg',
      6: 'White toast (2 slices) + banana',
      7: 'Electrolyte drink + plain porridge (small amount, 1/2 cup)'
    },
    lunch: {
      1: 'Brown rice (1 cup) + plenty of vegetables (2 cups) + lean meat (100g)',
      2: 'Buckwheat noodles + seaweed soup',
      3: 'Whole grain rice + greens + fish (150g)',
      4: 'Balanced lunch of choice',
      5: 'Clear soup noodles + blanched vegetables',
      6: 'White rice (1 cup) + steamed fish (100g)',
      7: 'Clear broth + white rice (small amount, 1/2 cup)'
    },
    dinner: {
      1: 'Sweet potato (200g) + plenty of green vegetables (2 cups)',
      2: 'Pumpkin soup (2 cups) + whole wheat bread',
      3: 'Vegetable soup + brown rice',
      4: 'Balanced dinner of choice',
      5: 'Congee (1.5 cups) + stir-fried vegetables',
      6: 'Rice porridge (1 cup) + steamed egg',
      7: 'Avoid eating or small amount of clear soup'
    },
    snacks: {
      1: 'Apples, pears (1-2 pieces), dried figs (3-4)',
      2: 'Yogurt (200ml), nuts (30g)',
      3: 'Fruits, nuts (small portion)',
      4: 'Moderate healthy snacks',
      5: 'Crackers (plain)',
      6: 'White toast (1 slice)',
      7: 'Avoid temporarily'
    }
  };
  
  return suggestions[mealType]?.[bristolType] || 'Consult a nutritionist';
}

// Get water intake - now considers volume issues
function getWaterIntake(bristolType, volumeIssues = []) {
  let baseIntake = {
    1: '2500-3000ml, sip throughout the day',
    2: '2000-2500ml, prefer warm water',
    3: '2000ml, normal intake',
    4: '1500-2000ml, maintain current intake',
    5: '2000ml, avoid ice water',
    6: '2500ml, include electrolytes',
    7: '3000ml+, with electrolyte drinks'
  }[bristolType] || '2000ml';
  
  if (volumeIssues.some(i => i.issue === 'Small volume')) {
    baseIntake += ' (increase by 500ml for small volume)';
  }
  
  return baseIntake;
}

// Get supplements - now considers color warnings
function getSupplements(bristolType, colorWarnings = []) {
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
      {name: 'Electrolyte powder', dosage: '1 packet', timing: 'Every 4 hours', reason: 'Replace lost electrolytes'}
    ],
    7: [
      {name: 'Oral rehydration solution', dosage: '250ml', timing: 'Every 2 hours', reason: 'Prevent dehydration'}
    ]
  };
  
  let supplements = supplementList[bristolType] || [];
  
  // Avoid iron if red/black detected
  if (colorWarnings.some(w => w.color === 'Red' || w.color === 'Black')) {
    supplements = supplements.filter(s => s.name !== 'Iron');
    supplements.push({
      name: 'Note',
      dosage: 'N/A',
      timing: 'N/A',
      reason: 'Avoid iron supplements due to color abnormality'
    });
  }
  
  return supplements;
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

// Get next check time - now considers urgency
function getNextCheckTime(bristolType, urgency) {
  if (urgency === 'high') return 'Tomorrow morning';
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
      'Take a 15-minute walk after each meal to promote bowel movement',
      'Do 5-minute clockwise abdominal massage before bed'
    ],
    2: [
      'Establish fixed toilet times to build habits',
      'Add fermented foods like kimchi or miso to lunch',
      "Don't delay when you feel the urge"
    ],
    3: [
      'Drink a glass of water 30 minutes before each meal',
      'Increase olive oil intake to 2 tablespoons daily',
      'Maintain your current exercise routine'
    ],
    4: [
      'Continue your excellent habits',
      'Keep tracking for consistency',
      'Share your success strategies with others'
    ],
    5: [
      'Pay attention to food storage and hygiene',
      'Reduce eating out frequency temporarily',
      'Chew food thoroughly (30 times per bite)'
    ],
    6: [
      'Follow BRAT diet for 24-48 hours',
      'Avoid caffeine and alcohol completely',
      'Eat 5-6 small meals instead of 3 large ones'
    ],
    7: [
      'Seek medical evaluation immediately',
      'Document all symptoms and timing',
      'Prepare list of foods eaten in past 24 hours'
    ]
  };
  return tips[bristolType] || ['Monitor changes', 'Track patterns', 'Adjust as needed'];
}

// Get motivational message - now more personalized
function getMotivationalMessage(bristolType, healthScore, specificConcerns) {
  if (healthScore > 80) {
    return "Excellent! Your digestive health is in great shape. Keep it up! 🌟";
  } else if (healthScore > 60) {
    return `You're doing well! ${specificConcerns.length > 0 ? 'Addressing ' + specificConcerns[0] : 'A few adjustments'} will get you to optimal health. You've got this! 💪`;
  } else if (healthScore > 40) {
    return `Don't worry - ${specificConcerns.length > 0 ? 'we\'ve identified ' + specificConcerns.length + ' specific areas to improve' : 'following these recommendations'} will lead to improvement soon. Stay positive! 🌈`;
  } else {
    return `Your health needs attention with ${specificConcerns.length > 0 ? specificConcerns[0] : 'current issues'}, but remember - it's never too late to start improving. We're here to help! ❤️`;
  }
}

// Get immediate action
function getImmediateAction(bristolType) {
  const actions = {
    1: 'Drink 500ml warm water immediately, perform 5-minute abdominal massage',
    2: 'Increase vegetable intake today to 3+ servings',
    3: 'Drink 300ml water now',
    4: 'Maintain current routine',
    5: 'Check food hygiene, wash hands',
    6: 'Replenish 500ml electrolytes, rest for 30 minutes',
    7: 'Drink 250ml oral rehydration solution, seek medical help immediately'
  };
  return actions[bristolType];
}

// Get natural remedies - now considers color
function getNaturalRemedies(bristolType, colorWarnings = []) {
  const remedies = {
    1: [
      {name: 'Flaxseed powder', method: 'Mix 2 tablespoons with warm water', frequency: 'Every morning', benefit: 'Natural laxative'},
      {name: 'Aloe vera juice', method: '30ml before meals', frequency: 'Twice daily', benefit: 'Promotes bowel movement'}
    ],
    2: [
      {name: 'Prune juice', method: 'Drink 100ml before bed', frequency: 'Daily', benefit: 'Natural constipation relief'}
    ],
    3: [
      {name: 'Honey water', method: 'Warm water with 1 tablespoon honey', frequency: 'Morning on empty stomach', benefit: 'Moistens intestines'}
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
  
  let remedyList = remedies[bristolType] || [];
  
  if (colorWarnings.some(w => w.color === 'Green')) {
    remedyList.push({
      name: 'Ginger tea',
      method: 'Steep fresh ginger in hot water',
      frequency: 'Twice daily',
      benefit: 'Helps with green coloration related to bile'
    });
  }
  
  return remedyList;
}

// Get prevention strategies - now comprehensive
function getPreventionStrategies(bristolType, colorWarnings = [], volumeIssues = []) {
  let strategies = [];
  
  if (bristolType <= 3) {
    strategies = [
      'Establish regular meal times (same time daily)',
      'Consume 25-30g dietary fiber daily from varied sources',
      'Develop consistent toilet habits (same time each morning)'
    ];
  } else if (bristolType >= 5) {
    strategies = [
      'Practice strict food safety and hygiene',
      'Avoid overeating - stop at 80% full',
      'Manage stress levels with daily relaxation'
    ];
  } else {
    strategies = [
      'Maintain balanced diet with variety',
      'Exercise regularly (150 min/week)',
      'Get adequate sleep (7-8 hours)'
    ];
  }
  
  // Add color-specific strategies
  if (colorWarnings.length > 0) {
    strategies.push(`Monitor and address ${colorWarnings[0].color} coloration causes`);
  }
  
  // Add volume-specific strategies
  if (volumeIssues.length > 0) {
    strategies.push(`Work on normalizing ${volumeIssues[0].issue.toLowerCase()}`);
  }
  
  return strategies;
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
  console.log(`🚀 Health Advisor AI API v2.6.0-IMPROVED`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Models: Gemini 2.5 Flash (primary)`);
  console.log(`📊 Health advice: http://localhost:${PORT}/api/health-advice`);
  console.log(`⚡ Quick advice: http://localhost:${PORT}/api/quick-advice`);
  console.log(`💚 Health check: http://localhost:${PORT}/`);
  console.log(`✨ NEW: Personalized color & volume analysis`);
  console.log(`🎯 NEW: Specific concern-based recommendations`);
  console.log('========================================\n');
});