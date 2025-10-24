const mongoose = require('mongoose')

const dbConnection = async () => {

    try {

        const DB_URI = process.env.MONGODB
        mongoose.set('strictQuery', false)
        
        await mongoose.connect(DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })

        console.log('**** MONGO DB: CONEXION CORRECTA ****')



    } catch (error) {
        console.log(error);
        throw new Error('Error al iniciar la BD.')
    }
}

module.exports = { dbConnection }