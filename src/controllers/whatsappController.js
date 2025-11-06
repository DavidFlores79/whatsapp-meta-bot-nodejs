const fetch = require("node-fetch");
const openaiService = require("../services/openaiService");
const fs = require("fs");
const whatsappService = require("../services/whatsappService");
const {
  analizeText,
  getTemplateData,
  formatNumber,
} = require("../shared/processMessage");
const ADMIN = process.env.WHATSAPP_ADMIN;

const verifyToken = (req, res) => {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log({ accessToken });
    console.log({ token });
    console.log({ challenge });

    if (challenge != null && token != null && accessToken == token) {
      return res.status(200).send(challenge);
    }

    return res.status(400).send({ msg: "El Token no está presente. Validar." });
  } catch (error) {
    return res.status(400).send();
  }
};

const receivedMessage = async (req, res) => {
  try {
    const { entry } = req.body;
    req.io.emit("incoming_messages", req.body);

    if (!entry) {
      console.log("******** NO ENTRY ********", req.body);
      return res.send("EVENT_RECEIVED");
    }
    const { changes } = entry[0];
    const { value } = changes[0];
    const { messages, errors, statuses, metadata } = value;

    if (!messages) {
      console.log("******** SERVER ********");
      console.log(JSON.stringify(changes[0]));
      return res.send("EVENT_RECEIVED");
    }
    const messageObject = messages[0];
    const messageType = messageObject.type;

    switch (messageType) {
      case "text": {
        console.log("es TEXT");
        const userRequest = messageObject.text.body;
        const messageId = messageObject.id; // WhatsApp message ID from webhook
        let number = messageObject.from;

        // Format number if it has 13 digits (5219991992696 -> 529991992696)
        if (number.length === 13) {
          number = formatNumber(number);
        }

        // Call OpenAI Assistant for AI response
        try {
          // Show typing indicator while processing (mark message as read + show typing)
          whatsappService.sendTypingIndicator(messageId, "text");

          // Get AI response (this may take several seconds)
          const aiReply = await openaiService.getAIResponse(
            userRequest,
            number
          );

          // Send AI reply back to user
          const replyPayload =
            require("../shared/whatsappModels").buildTextJSON(number, aiReply);
          whatsappService.sendWhatsappResponse(replyPayload);
        } catch (err) {
          console.error("AI response error:", err);
        }
        // Optionally still run analizeText if needed for business logic
        // analizeText(userRequest, number);
        break;
      }
      case "interactive": {
        console.log("es INTERACTIVE");
        const { type: interactiveType } = messageObject.interactive;
        break;
      }
      //templates
      case "button": {
        console.log("es BUTTON");
        break;
      }
      case "image": {
        const imageId = messageObject.image.id;
        const imageCaption = messageObject.image.caption || "";
        const imageMimeType = messageObject.image.mime_type || "";
        const messageId = messageObject.id;
        
        console.log("📸 IMAGE received - ID:", imageId);
        console.log("   Caption:", imageCaption);
        console.log("   MIME Type:", imageMimeType);
        
        let number = messageObject.from;
        if (number.length === 13) {
          number = formatNumber(number);
        }

        try {
          // Show typing indicator
          whatsappService.sendTypingIndicator(messageId, "text");

          // Get the actual media URL from WhatsApp
          const imageUrl = await whatsappService.getMediaUrl(imageId);
          console.log("✅ Retrieved image URL from WhatsApp");
          
          // Upload to Cloudinary for permanent storage
          const cloudinaryService = require("../services/cloudinaryService");
          const uploadResult = await cloudinaryService.uploadTicketImage(
            imageUrl,
            number,
            process.env.WHATSAPP_API_TOKEN
          );
          
          console.log(`✅ Image uploaded to Cloudinary: ${uploadResult.url}`);
          
          // Build message for AI assistant including image context
          let messageForAI = "El usuario ha enviado una imagen.";
          if (imageCaption) {
            messageForAI += ` Descripción de la imagen: "${imageCaption}"`;
          }
          messageForAI += `\n\nURL de la imagen: ${uploadResult.url}`;
          messageForAI += `\n\nSi el usuario está reportando un problema, puedes usar esta imagen como evidencia en el ticket.`;
          
          // Send to AI assistant with image context
          const aiReply = await openaiService.getAIResponse(
            messageForAI,
            number,
            { imageUrl: uploadResult.url, imageCaption }
          );
          
          // Send AI reply back to user
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, aiReply);
          whatsappService.sendWhatsappResponse(replyPayload);
          
        } catch (error) {
          console.error("❌ Error processing image:", error);
          
          // Send error message to user
          const errorReply = "Recibí tu imagen pero hubo un problema al procesarla. Por favor, intenta enviarla nuevamente o descríbeme el problema.";
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, errorReply);
          whatsappService.sendWhatsappResponse(replyPayload);
        }
        
        break;
      }
      case "location": {
        const location = messageObject.location;
        const latitude = location.latitude;
        const longitude = location.longitude;
        const locationName = location.name || "";
        const locationAddress = location.address || "";
        const messageId = messageObject.id;
        
        console.log("📍 LOCATION received:", { latitude, longitude, locationName, locationAddress });
        
        let number = messageObject.from;
        if (number.length === 13) {
          number = formatNumber(number);
        }

        try {
          // Show typing indicator
          whatsappService.sendTypingIndicator(messageId, "text");

          // Reverse geocode to get formatted address
          const geocodingService = require("../services/geocodingService");
          const addressData = await geocodingService.reverseGeocode(latitude, longitude);
          
          console.log(`✅ Location geocoded: ${addressData.formatted_address}`);
          
          // Build message for AI assistant including location context
          let messageForAI = "El usuario ha enviado su ubicación.\n\n";
          messageForAI += `📍 Dirección: ${addressData.formatted_address}\n`;
          messageForAI += `Coordenadas: ${addressData.coordinates_string}\n`;
          
          if (locationName) {
            messageForAI += `Nombre del lugar: ${locationName}\n`;
          }
          
          if (addressData.city) {
            messageForAI += `Ciudad: ${addressData.city}\n`;
          }
          
          if (addressData.state) {
            messageForAI += `Estado: ${addressData.state}\n`;
          }
          
          messageForAI += `\nSi el usuario está reportando un problema, puedes usar esta ubicación como la dirección del servicio en el ticket.`;
          
          // Send to AI assistant with location context
          const aiReply = await openaiService.getAIResponse(
            messageForAI,
            number,
            { location: addressData }
          );
          
          // Send AI reply back to user
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, aiReply);
          whatsappService.sendWhatsappResponse(replyPayload);
          
        } catch (error) {
          console.error("❌ Error processing location:", error);
          
          // Fallback: send basic acknowledgment
          const fallbackReply = `Recibí tu ubicación (${latitude}, ${longitude}). Si estás reportando un problema, por favor confírmame la dirección donde necesitas el servicio.`;
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, fallbackReply);
          whatsappService.sendWhatsappResponse(replyPayload);
        }
        
        break;
      }
      default: {
        console.log({ messageObject });
        console.log("Entró al default!! Tipo: ", messageType);
        break;
      }
    }
    return res.send("EVENT_RECEIVED");
  } catch (error) {
    console.log({ error });
    return res.send("EVENT_RECEIVED");
  }
};

const sendTemplateData = async (req, res) => {
  const { data } = req.body;
  const { number, template_name, parameters, language } = data;

  console.log({ number, template_name, parameters, language });

  try {
    let templateData = getTemplateData(
      number,
      template_name,
      parameters,
      language
    );
    whatsappService.sendWhatsappResponse(templateData);
    // let adminMsg = getTextData(`Se envió el Template ${template_name} al Cel ${number}`, ADMIN);
    // whatsappService.sendWhatsappResponse(adminMsg);

    return res.send({ msg: "Template Enviado correctamente.", data });
  } catch (error) {
    return res.status(400).send({ msg: error, data });
  }
};

const cleanupUserThread = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).send({ 
        msg: "userId is required", 
        success: false 
      });
    }

    const result = await openaiService.cleanupUserThread(userId);
    
    if (result) {
      return res.send({ 
        msg: `Thread cleanup completed for user ${userId}`, 
        success: true 
      });
    } else {
      return res.status(404).send({ 
        msg: `No thread found for user ${userId}`, 
        success: false 
      });
    }
  } catch (error) {
    console.error("Error in cleanupUserThread:", error);
    return res.status(500).send({ 
      msg: "Error cleaning up thread", 
      error: error.message,
      success: false 
    });
  }
};

module.exports = {
  verifyToken,
  receivedMessage,
  sendTemplateData,
  cleanupUserThread,
};
