import id from "zod/v4/locales/id.js";
import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";


interface User {
    id: string
    name: string
    email: string
    passwordHash: string
    role: Role

}


export class UserRepository {

    private readonly pulicSelect = {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
    }
    
    async findall(): Promise<User[]> {
        
         const users = await prisma.user.findMany({
            select: this.pulicSelect,
            orderBy: {createdAt: 'desc'}
         })

         return users
        
    }


    async findById(id: string): Promise<User | null> {

        const user = await prisma.user.findUnique({
            where: {id}
        })
        
        return user
        
    }
}

