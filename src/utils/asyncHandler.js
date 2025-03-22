
const asyncHandler = (requestHandler) => {
    (req,res,next) => {
        Promise.resolve(requestHandler(req,res,next)).catch((error)=> next(error))
    }
} 



export {asyncHandler}




// Async Handler using the try catch method this is a wrapper method used as a utility called whenever required


// const asyncHandler = (fn)=>  async (req,res,next) => {
//     try {
//         await fn(req,res,next)
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success: false,
//             message: error.message
//         })
        
// //     }
// }