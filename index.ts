import { Body, Controller, Get, Injectable, Module, Param, Post, createApp } from './lib';

class LoginDto {
  username: string;
  password: string;
}

@Injectable()
class UserRepository {
  async findOne(id: string) {
    return { userId: id };
  }
}

@Injectable()
class AuthService {
  constructor(private readonly userRepository: UserRepository) {}
  async login({ username }: LoginDto) {
    return `login successful for ${username}`;
  }

  async findUser(id: string) {
    return this.userRepository.findOne(id);
  }
}

@Controller('auth')
class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  login(@Body() loginData: LoginDto) {
    console.log({ loginData });
    return this.authService.login(loginData);
  }

  @Get('/profile/:id')
  async profile(@Param('id') id: string) {
    const user = await this.authService.findUser(id);
    return `user: ${user.userId}`;
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
class AppModule {}

const app = createApp(AppModule);

app.listen(3001, () => {
  console.log('listening on port 3001');
});
