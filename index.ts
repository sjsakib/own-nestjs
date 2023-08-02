import { Controller, Get, Injectable, Module, Param, createApp } from './lib';

@Injectable()
class AuthService {
  async login() {
    return 'login successful';
  }
}

@Controller('auth')
class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Get('/login/:token')
  login(@Param('token') token: string) {
    console.log({ token });
    return this.authService.login();
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
