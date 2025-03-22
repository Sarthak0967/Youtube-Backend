class ApiError extends Error {
    constructor(
        status,
        message="Something went Wrong".
        errors=[],
        stack = ""
    ){
        super(message)
        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.errors = this.errors

        if(stack){
            this.stack = stack
        } else {
            this.captureStackTrace(this,this.constructor)
        }
    }
}

export {ApiError}