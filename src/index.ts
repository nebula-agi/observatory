import { startServer } from "./server"

const port = parseInt(process.env.PORT || "3004", 10)
const open = process.env.NODE_ENV !== "production"

startServer({ port, open }).catch(console.error)
