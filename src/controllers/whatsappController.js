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
        // WhatsApp sends image.id, not image.url directly
        const imageId = messageObject.image.id;
        const imageCaption = messageObject.image.caption || "";
        const imageMimeType = messageObject.image.mime_type || "";
        const imageSha256 = messageObject.image.sha256 || "";
        
        console.log("es IMAGE con ID:", imageId);
        console.log("Caption:", imageCaption);
        console.log("MIME Type:", imageMimeType);
        
        let number = messageObject.from;
        if (number.length === 13) {
          number = formatNumber(number);
        }

        try {
          // Get the actual media URL from WhatsApp
          const imageUrl = await whatsappService.getMediaUrl(imageId);
          console.log("Retrieved image URL:", imageUrl);
          
          // TODO: Now you can download and upload to Cloudinary
          // 1. Download image from imageUrl (expires in a few minutes)
          // 2. Upload to Cloudinary using their API
          // 3. Store Cloudinary URL in ticket data
          // 4. Pass image URL to OpenAI assistant for ticket creation
          // 5. Consider image analysis for automatic ticket categorization
          
          // For now, acknowledge the image was received with its metadata
          let imageReply = "Imagen recibida y URL obtenida exitosamente. Próximamente podremos procesarla automáticamente para incluirla en tu ticket.";
          if (imageCaption) {
            imageReply += `\n\nDescripción de la imagen: "${imageCaption}"`;
          }
          
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, imageReply);
          whatsappService.sendWhatsappResponse(replyPayload);
          
        } catch (error) {
          console.error("Error getting image URL:", error);
          
          // Send error message to user
          const errorReply = "Hubo un problema al procesar la imagen recibida. Por favor, intenta enviarla nuevamente.";
          const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, errorReply);
          whatsappService.sendWhatsappResponse(replyPayload);
        }
        
        break;
      }
      case "location": {
        // TODO: Implement location processing and add to ticket address
        // - Extract latitude and longitude from messageObject.location
        // - Use reverse geocoding API (Google Maps, OpenStreetMap) to get address
        // - Format address for ticket creation
        // - Pass location data to OpenAI assistant
        // - Store both coordinates and formatted address in ticket
        
        console.log("es LOCATION:", messageObject.location);
        let number = messageObject.from;
        if (number.length === 13) {
          number = formatNumber(number);
        }

        // For now, just acknowledge the location was received
        const locationReply = "Ubicación recibida. Próximamente podremos procesarla automáticamente para incluirla en la dirección de tu ticket.";
        const replyPayload = require("../shared/whatsappModels").buildTextJSON(number, locationReply);
        whatsappService.sendWhatsappResponse(replyPayload);
        
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
